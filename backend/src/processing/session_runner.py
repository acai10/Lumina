import logging
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from ..config import settings
from ..schemas.enums import JobStatus
from .h5_reader import load_volume
from .metrics import compute_hausdorff, compute_rmse
from .multi_volume import (
    compute_global_offsets,
    compute_mip,
    extract_surface_pointcloud,
    merge_volumes,
    overlap_crop,
    register_pair,
)

logger = logging.getLogger(__name__)


@dataclass
class SessionState:
    status: JobStatus = JobStatus.PENDING
    offsets: dict[str, list[float]] = field(default_factory=dict)
    metrics: dict[str, float] = field(default_factory=dict)
    error: str | None = None


class SessionStore:
    """In-memory store for multi-volume stitching session state."""

    def __init__(self) -> None:
        self._sessions: dict[str, SessionState] = {}

    def create(self, session_id: str) -> SessionState:
        """Initialise a new session in PENDING state and return it."""
        state = SessionState()
        self._sessions[session_id] = state
        return state

    def get(self, session_id: str) -> SessionState | None:
        """Return the SessionState for *session_id*, or None if unknown."""
        return self._sessions.get(session_id)


session_store = SessionStore()


async def run_session(
    session_id: str,
    volume_entries: list[dict[str, Any]],
    method: str = "phase_correlation",
    method_params: dict[str, Any] | None = None,
) -> None:
    """Execute the multi-volume stitching pipeline as a background task.

    Args:
        session_id: UUID string identifying this session in the store.
        volume_entries: List of ``{"volume_id": str, "row": int, "col": int}`` dicts.
        method: Registration method — ``"phase_correlation"``, ``"cross_correlation"``,
            or ``"icp"``.
        method_params: Per-method parameter overrides.
    """
    state = session_store.get(session_id)
    if state is None:
        logger.error("run_session called for unknown session_id %s", session_id)
        return

    logger.info(
        "Session %s started (%d volumes, method=%s)", session_id, len(volume_entries), method
    )
    state.status = JobStatus.RUNNING

    try:
        # ── Load all volumes ──────────────────────────────────────────────────
        volumes: dict[str, np.ndarray] = {}
        grid: dict[str, tuple[int, int]] = {}

        for entry in volume_entries:
            vid = str(entry["volume_id"])
            row, col = int(entry["row"]), int(entry["col"])
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
        state.offsets = {vid: list(off) for vid, off in global_offsets.items()}

        # ── Merge and save ────────────────────────────────────────────────────
        vol_list = [volumes[vid] for vid in volume_ids]
        off_list = [global_offsets[vid] for vid in volume_ids]
        merged = merge_volumes(vol_list, off_list)
        np.save(settings.uploads_dir / f"{session_id}_merged.npy", merged)

        mip = compute_mip(merged)
        np.save(settings.uploads_dir / f"{session_id}_mip.npy", mip)

        # ── Quality metrics over overlapping adjacent pairs ───────────────────
        rmse_vals: list[float] = []
        hausdorff_vals: list[float] = []

        for (a_id, b_id), (dy, dx) in pairwise_shifts.items():
            crops = overlap_crop(volumes[a_id], volumes[b_id], dy, dx)
            if crops is not None:
                crop_a, crop_b = crops
                rmse_vals.append(compute_rmse(crop_a, crop_b))

            pts_a = extract_surface_pointcloud(volumes[a_id], max_points=5_000)
            pts_b = extract_surface_pointcloud(volumes[b_id], max_points=5_000)
            pts_b_shifted = pts_b.copy()
            pts_b_shifted[:, 1] += dy
            pts_b_shifted[:, 2] += dx
            hausdorff_vals.append(compute_hausdorff(pts_a, pts_b_shifted))

        state.metrics["rmse"] = float(np.mean(rmse_vals)) if rmse_vals else 0.0
        state.metrics["hausdorff"] = float(np.mean(hausdorff_vals)) if hausdorff_vals else 0.0

        state.status = JobStatus.DONE
        logger.info("Session %s completed — merged shape %s", session_id, merged.shape)

    except Exception as exc:
        logger.exception("Session %s failed", session_id)
        state.status = JobStatus.ERROR
        state.error = f"{type(exc).__name__}: {exc}"
