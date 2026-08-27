"""Session store and background execution of multi-volume stitching sessions.

Where :mod:`.runner` compares stitchers on a single volume, a session is the real
mosaicking job: several tiles at known grid positions are registered pairwise,
placed in one coordinate frame, merged, and written out as a new volume that the
frontend can load like any other.

:func:`_execute_session` is the pipeline; :data:`session_store` is the process-wide
singleton holding the state that ``GET /sessions/{id}`` polls. Its lock exists
because the background task mutates ``offsets``/``metrics`` while poll requests
serialise them.
"""
import asyncio
import logging
import threading
from dataclasses import dataclass, field
from typing import Any

import h5py
import numpy as np

from ..config import settings
from ..schemas.enums import JobStatus
from .h5_reader import load_volume
from .metrics import compute_rmse
from .multi_volume import (
    compute_global_offsets,
    merge_volumes,
    overlap_crop,
    register_pair,
)
from .normalizer import normalize_for_frontend, save_packed

logger = logging.getLogger(__name__)


@dataclass
class SessionState:
    status: JobStatus = JobStatus.PENDING
    offsets: dict[str, list[float]] = field(default_factory=dict)
    metrics: dict[str, float] = field(default_factory=dict)
    merged_volume_id: str | None = None
    error: str | None = None


class SessionStore:
    """In-memory store for multi-volume stitching session state.

    ``lock`` guards mutable SessionState fields (``offsets``/``metrics``) that
    the background task mutates while poll endpoints serialise them.
    """

    def __init__(self) -> None:
        self._sessions: dict[str, SessionState] = {}
        self.lock = threading.Lock()

    def create(self, session_id: str) -> SessionState:
        """Initialise a new session in PENDING state and return it."""
        state = SessionState()
        with self.lock:
            self._sessions[session_id] = state
        return state

    def get(self, session_id: str) -> SessionState | None:
        """Return the SessionState for *session_id*, or None if unknown."""
        with self.lock:
            return self._sessions.get(session_id)

    def any_running(self) -> bool:
        """True if any session is currently PENDING or RUNNING."""
        with self.lock:
            return any(
                s.status in (JobStatus.PENDING, JobStatus.RUNNING) for s in self._sessions.values()
            )

    def clear_finished(self) -> None:
        """Drop all sessions that are neither PENDING nor RUNNING (frees memory)."""
        with self.lock:
            self._sessions = {
                k: s
                for k, s in self._sessions.items()
                if s.status in (JobStatus.PENDING, JobStatus.RUNNING)
            }


session_store = SessionStore()


def _execute_session(
    session_id: str,
    volume_entries: list[dict[str, Any]],
    method: str,
    state: SessionState,
) -> None:
    """Run the full load → register → merge → normalise pipeline synchronously.

    Called from :func:`run_session` inside a worker thread (``asyncio.to_thread``)
    so the event loop stays responsive while a session computes — mirroring the
    job pipeline in ``runner.py``.

    Args:
        session_id: UUID string identifying this session (used as filename prefix).
        volume_entries: List of ``{"volume_id": str, "row": int, "col": int}`` dicts.
        method: Registration method — ``"phase_correlation"`` or ``"cross_correlation"``.
        state: Mutable session state updated in place.
    """
    # ── Load all volumes ──────────────────────────────────────────────────
    volumes: dict[str, np.ndarray] = {}
    grid: dict[str, tuple[int, int]] = {}

    seen_positions: dict[tuple[int, int], str] = {}
    for entry in volume_entries:
        vid = str(entry["volume_id"])
        row, col = int(entry["row"]), int(entry["col"])
        # A duplicate (row, col) would silently shadow one volume in the
        # position lookup below; the shadowed tile would never be reached
        # by BFS and end up merged at offset (0, 0).
        if (row, col) in seen_positions:
            raise ValueError(
                f"Duplicate grid position ({row}, {col}) for volumes "
                f"{seen_positions[(row, col)]!r} and {vid!r}"
            )
        seen_positions[(row, col)] = vid
        volumes[vid] = load_volume(settings.uploads_dir / f"{vid}.h5")
        grid[vid] = (row, col)
        logger.debug("Loaded volume %s at grid (%d, %d)", vid, row, col)

    volume_ids = list(volumes.keys())
    pos_to_id: dict[tuple[int, int], str] = {v: k for k, v in grid.items()}

    # ── Pairwise registration for adjacent grid neighbours ────────────────
    pairwise_shifts: dict[tuple[str, str], tuple[float, float]] = {}

    for vid, (r, c) in grid.items():
        for neighbour_pos in ((r, c + 1), (r + 1, c)):
            nb = pos_to_id.get(neighbour_pos)
            if nb is None:
                continue
            dy, dx = register_pair(volumes[vid], volumes[nb], method)
            pairwise_shifts[(vid, nb)] = (dy, dx)
            logger.debug("Pair %s→%s: (dy=%f, dx=%f)", vid, nb, dy, dx)

    # ── Compute absolute offsets via BFS ──────────────────────────────────
    global_offsets = compute_global_offsets(volume_ids, grid, pairwise_shifts)
    with session_store.lock:
        state.offsets = {vid: list(off) for vid, off in global_offsets.items()}

    # ── Quality metrics over overlapping adjacent pairs ───────────────────
    # Computed HERE — before the merge — so that the individual volumes
    # (~800 MB for 25 inputs) can be freed immediately after, preventing
    # them from overlapping in memory with the merged array and the
    # normalization intermediates (which would push peak to 2.5+ GB).
    rmse_vals: list[float] = []

    for (a_id, b_id), (dy, dx) in pairwise_shifts.items():
        crops = overlap_crop(volumes[a_id], volumes[b_id], dy, dx)
        if crops is not None:
            crop_a, crop_b = crops
            rmse_vals.append(compute_rmse(crop_a, crop_b))

    with session_store.lock:
        state.metrics["rmse"] = float(np.mean(rmse_vals)) if rmse_vals else 0.0

    # ── Merge and save ────────────────────────────────────────────────────
    # Build vol_list/off_list now that metrics are done; free volumes after merge.
    vol_list = [volumes[vid] for vid in volume_ids]
    off_list = [global_offsets[vid] for vid in volume_ids]
    merged = merge_volumes(vol_list, off_list)
    merged_shape = merged.shape
    merged_npy_path = settings.uploads_dir / f"{session_id}_merged.npy"

    np.save(merged_npy_path, merged)

    merged_h5_path = settings.uploads_dir / f"{session_id}_merged.h5"
    with h5py.File(merged_h5_path, "w") as hf:
        hf.create_dataset("OCT", data=merged, dtype=np.float32)
    state.merged_volume_id = f"{session_id}_merged"

    # Free individual volumes (~800 MB) and merged array (~1 GB) before
    # normalization so they do not overlap with normalization intermediates.
    # Without this, peak RAM for a 25-volume session exceeds 2.5 GB.
    del vol_list, off_list, volumes, merged

    # ── Pre-normalise for frontend ────────────────────────────────────────
    # Reload via memory-map; the OS manages which pages stay in RAM so only
    # ~50 MB of page cache is live at a time instead of the full 1 GB.
    merged_mmap = np.load(str(merged_npy_path), mmap_mode="r")
    v_idx, v_int, norm_u8 = normalize_for_frontend(merged_mmap)
    del merged_mmap

    save_packed(
        v_idx,
        v_int,
        norm_u8,
        merged_shape,
        settings.uploads_dir / f"{session_id}_frontend",
    )
    logger.info(
        "Session %s: pre-normalised frontend data saved (%d voxels above threshold)",
        session_id,
        len(v_idx),
    )

    state.status = JobStatus.DONE
    logger.info("Session %s completed — merged shape %s", session_id, merged_shape)


async def run_session(
    session_id: str,
    volume_entries: list[dict[str, Any]],
    method: str = "phase_correlation",
    method_params: dict[str, Any] | None = None,
) -> None:
    """Execute the multi-volume stitching pipeline as a background task.

    The pipeline runs in a worker thread via ``asyncio.to_thread`` so the event
    loop (and with it status polling and every other endpoint) stays responsive
    during the multi-minute stitch — the same pattern as ``runner.run_job``.

    Args:
        session_id: UUID string identifying this session in the store.
        volume_entries: List of ``{"volume_id": str, "row": int, "col": int}`` dicts.
        method: Registration method — ``"phase_correlation"`` or ``"cross_correlation"``.
        method_params: Reserved for per-method parameter overrides; accepted for
            forward compatibility but currently unused by the registration methods.
    """
    del method_params  # accepted but unused — see docstring
    state = session_store.get(session_id)
    if state is None:
        logger.error("run_session called for unknown session_id %s", session_id)
        return

    logger.info(
        "Session %s started (%d volumes, method=%s)", session_id, len(volume_entries), method
    )
    state.status = JobStatus.RUNNING

    try:
        await asyncio.to_thread(_execute_session, session_id, volume_entries, method, state)
    except Exception as exc:
        logger.exception("Session %s failed", session_id)
        state.status = JobStatus.ERROR
        state.error = f"{type(exc).__name__}: {exc}"
        # Remove partial artifacts: a half-written merged volume or packed
        # binary must never be served by a later request (np.save is not
        # atomic), and dead files would leak disk until manual /cleanup.
        for suffix in ("_merged.npy", "_merged.h5", "_frontend.bin", "_frontend.json"):
            (settings.uploads_dir / f"{session_id}{suffix}").unlink(missing_ok=True)
