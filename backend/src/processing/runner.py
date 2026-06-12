import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from ..config import settings
from ..schemas.enums import JobStatus
from .filters import apply_filter_chain
from .h5_reader import load_volume_flexible as load_volume
from .metrics import compute_all
from .stitchers import STITCHER_REGISTRY

logger = logging.getLogger(__name__)


@dataclass
class JobState:
    status: JobStatus = JobStatus.PENDING
    results: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


class JobStore:
    """In-memory store for job state, keyed by job_id."""

    def __init__(self) -> None:
        self._jobs: dict[str, JobState] = {}

    def create(self, job_id: str) -> JobState:
        """Initialise a new job in PENDING state and return it."""
        state = JobState()
        self._jobs[job_id] = state
        return state

    def get(self, job_id: str) -> JobState | None:
        """Return the JobState for *job_id*, or None if unknown."""
        return self._jobs.get(job_id)


job_store = JobStore()


def get_job(job_id: str) -> JobState | None:
    """Return the JobState for *job_id*, or None if unknown."""
    return job_store.get(job_id)


def create_job(job_id: str) -> JobState:
    """Initialise a new job in PENDING state and return it."""
    return job_store.create(job_id)


def _execute_pipeline(
    job_id: str,
    volume_id: str,
    filter_chain: list[dict[str, Any]],
    stitchers: list[str],
    stitcher_params: dict[str, dict[str, Any]],
    state: JobState,
) -> None:
    """Run the full filter → stitch pipeline synchronously in a worker thread.

    Filters are applied one at a time in the declared order.  Each stitcher
    then processes the filtered result and its output is saved to disk.

    Args:
        job_id: Identifies this job (used as filename prefix for results).
        volume_id: Stem of the ``.h5`` source file in ``uploads_dir``.
        filter_chain: Ordered filter steps, each ``{"type": str, "params": dict}``.
        stitchers: Stitcher names to run sequentially after filtering.
        stitcher_params: Per-stitcher parameter overrides.
        state: Mutable job state updated in place.
    """
    volume = load_volume(settings.uploads_dir / f"{volume_id}.h5")

    # Apply filters one by one so earlier results feed later steps.
    preprocessed = volume
    for i, step in enumerate(filter_chain):
        logger.debug("Job %s: applying filter step %d/%d", job_id, i + 1, len(filter_chain))
        preprocessed = apply_filter_chain(preprocessed, [step], copy_input=False)

    # Run each stitcher sequentially on the preprocessed volume.
    for name in stitchers:
        if name not in STITCHER_REGISTRY:
            logger.warning("Job %s: unknown stitcher %r — skipped", job_id, name)
            continue
        try:
            logger.debug("Job %s: running stitcher %r", job_id, name)
            result_vol = STITCHER_REGISTRY[name](preprocessed, stitcher_params.get(name, {}))
            np.save(settings.uploads_dir / f"{job_id}_{name}.npy", result_vol)
            state.results[name] = compute_all(preprocessed, result_vol)
        except Exception as exc:
            logger.exception("Stitcher %s failed for job %s", name, job_id)
            state.results[name] = {"error": f"{type(exc).__name__}: {exc}"}

    state.status = JobStatus.DONE
    logger.info("Job %s completed successfully", job_id)


async def run_job(
    job_id: str,
    volume_id: str,
    filter_chain: list[dict[str, Any]],
    stitchers: list[str],
    stitcher_params: dict[str, dict[str, Any]] | None = None,
) -> None:
    """Execute the full filter + stitch pipeline for *job_id* as a background task.

    The pipeline runs in a worker thread via ``asyncio.to_thread`` so the
    event loop stays free during computation.  Filters are applied sequentially
    in the declared order before any stitcher runs.

    Args:
        job_id: UUID string that identifies this job in the store.
        volume_id: Stem of the .h5 file to load from uploads_dir.
        filter_chain: Ordered list of ``{"type": str, "params": dict}`` dicts.
        stitchers: Names of stitchers to run (must be in STITCHER_REGISTRY).
        stitcher_params: Per-stitcher kwarg overrides.
    """
    state = job_store.get(job_id)
    if state is None:
        logger.error("run_job called for unknown job_id %s", job_id)
        return

    logger.info("Job %s started (volume=%s, stitchers=%s)", job_id, volume_id, stitchers)
    state.status = JobStatus.RUNNING

    try:
        await asyncio.to_thread(
            _execute_pipeline,
            job_id,
            volume_id,
            filter_chain,
            stitchers,
            stitcher_params or {},
            state,
        )
    except Exception as exc:
        logger.exception("Job %s failed", job_id)
        state.status = JobStatus.ERROR
        state.error = f"{type(exc).__name__}: {exc}"
