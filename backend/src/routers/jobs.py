import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from src.config import UPLOADS_DIR
from src.processing.runner import create_job, get_job, run_job
from src.processing.stitchers import STITCHER_REGISTRY

router = APIRouter()


class FilterStep(BaseModel):
    type: str
    params: dict[str, Any] = Field(default_factory=dict)


class JobRequest(BaseModel):
    volume_id: str
    filter_chain: list[FilterStep] = Field(default_factory=list)
    stitchers: list[str]
    stitcher_params: dict[str, dict[str, Any]] = Field(default_factory=dict)
    segmentation_mask_id: str | None = None


class JobCreated(BaseModel):
    job_id: str


class JobStatus(BaseModel):
    status: str
    results: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None


@router.post("/", response_model=JobCreated)
async def create_job_endpoint(
    request: JobRequest,
    background_tasks: BackgroundTasks,
) -> JobCreated:
    if not (UPLOADS_DIR / f"{request.volume_id}.h5").exists():
        raise HTTPException(status_code=404, detail="Volume not found.")

    unknown = [s for s in request.stitchers if s not in STITCHER_REGISTRY]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown stitchers: {unknown}")

    job_id = str(uuid.uuid4())
    create_job(job_id)

    filter_chain = [step.model_dump() for step in request.filter_chain]
    background_tasks.add_task(
        run_job,
        job_id,
        request.volume_id,
        filter_chain,
        request.stitchers,
        request.stitcher_params,
        request.segmentation_mask_id,
    )

    return JobCreated(job_id=job_id)


@router.get("/{job_id}", response_model=JobStatus)
def get_job_status(job_id: str) -> JobStatus:
    state = get_job(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return JobStatus(status=state.status, results=state.results, error=state.error)
