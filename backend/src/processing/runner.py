import asyncio
import logging
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from ..config import settings
from ..schemas.enums import JobStatus
from .filters import apply_filter_chain
from .h5_reader import load_volume
from .metrics import compute_all
from .stitchers import STITCHER_REGISTRY

logger = logging.getLogger(__name__)

# Lazy so worker processes (Windows spawn) don't re-instantiate it on import.
_executor: ProcessPoolExecutor | None = None


def _get_executor() -> ProcessPoolExecutor:
    global _executor
    if _executor is None:
        _executor = ProcessPoolExecutor()
    return _executor


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
    """Public accessor kept for backward compatibility with routers."""
    return job_store.get(job_id)


def create_job(job_id: str) -> JobState:
    """Public factory kept for backward compatibility with routers."""
    return job_store.create(job_id)


def _run_stitcher_sync(
    volume: np.ndarray,
    stitcher_name: str,
    params: dict,
) -> np.ndarray:
    fn = STITCHER_REGISTRY[stitcher_name]
    return fn(volume, params)


def shutdown_executor() -> None:
    """Shut down the process pool; called by the FastAPI lifespan handler."""
    if _executor is not None:
        _executor.shutdown(wait=False)


async def run_job(
    job_id: str,
    volume_id: str,
    filter_chain: list[dict[str, Any]],
    stitchers: list[str],
    stitcher_params: dict[str, dict[str, Any]] | None = None,
    seg_mask_id: str | None = None,
) -> None:
    """Execute the full filter + stitch pipeline for *job_id* as a background task.

    Args:
        job_id: UUID string that identifies this job in the store.
        volume_id: Stem of the .h5 file to load from uploads_dir.
        filter_chain: Ordered list of ``{"type": str, "params": dict}`` dicts.
        stitchers: Names of stitchers to run (must be in STITCHER_REGISTRY).
        stitcher_params: Per-stitcher kwarg overrides.
        seg_mask_id: Optional volume_id of a segmentation mask for Dice metric.
    """
    state = job_store.get(job_id)
    if state is None:
        logger.error("run_job called for unknown job_id %s", job_id)
        return

    logger.info("Job %s started (volume=%s, stitchers=%s)", job_id, volume_id, stitchers)
    state.status = JobStatus.RUNNING

    try:
        volume = load_volume(settings.uploads_dir / f"{volume_id}.h5")
        preprocessed = apply_filter_chain(volume, filter_chain) if filter_chain else volume

        loop = asyncio.get_running_loop()
        s_params = stitcher_params or {}

        tasks = {
            name: loop.run_in_executor(
                _get_executor(),
                _run_stitcher_sync,
                preprocessed,
                name,
                s_params.get(name, {}),
            )
            for name in stitchers
            if name in STITCHER_REGISTRY
        }

        for name, task in tasks.items():
            try:
                result_vol = await task
                np.save(settings.uploads_dir / f"{job_id}_{name}.npy", result_vol)
                state.results[name] = compute_all(preprocessed, result_vol)
            except Exception as exc:
                logger.exception("Stitcher %s failed for job %s", name, job_id)
                state.results[name] = {"error": f"{type(exc).__name__}: {exc}"}

        state.status = JobStatus.DONE
        logger.info("Job %s completed successfully", job_id)

    except Exception as exc:
        logger.exception("Job %s failed", job_id)
        state.status = JobStatus.ERROR
        state.error = f"{type(exc).__name__}: {exc}"
