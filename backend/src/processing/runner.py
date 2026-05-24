import asyncio
import logging
from concurrent.futures import ProcessPoolExecutor
from dataclasses import dataclass, field
from typing import Any

import numpy as np

from ..config import UPLOADS_DIR
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
    status: str = "pending"
    results: dict[str, Any] = field(default_factory=dict)
    error: str | None = None


_jobs: dict[str, JobState] = {}


def get_job(job_id: str) -> JobState | None:
    return _jobs.get(job_id)


def create_job(job_id: str) -> JobState:
    state = JobState()
    _jobs[job_id] = state
    return state


def _run_stitcher_sync(
    volume: np.ndarray,
    stitcher_name: str,
    params: dict,
) -> np.ndarray:
    fn = STITCHER_REGISTRY[stitcher_name]
    return fn(volume, params)


def shutdown_executor() -> None:
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
    state = _jobs[job_id]
    state.status = "running"

    try:
        volume = load_volume(UPLOADS_DIR / f"{volume_id}.h5")
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
                np.save(UPLOADS_DIR / f"{job_id}_{name}.npy", result_vol)
                state.results[name] = compute_all(preprocessed, result_vol)
            except Exception as exc:
                logger.exception("Stitcher %s failed for job %s", name, job_id)
                state.results[name] = {"error": str(exc)}

        state.status = "done"

    except Exception as exc:
        logger.exception("Job %s failed", job_id)
        state.status = "error"
        state.error = str(exc)
