import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException

from src.config import settings
from src.processing.runner import create_job, get_job, run_job
from src.processing.stitchers import STITCHER_REGISTRY
from src.schemas.jobs import JobCreated, JobRequest, JobStatusResponse

router = APIRouter()


@router.post(
    "/",
    response_model=JobCreated,
    status_code=201,
    summary="Create processing job",
    description="Submit a filter chain and list of stitchers to run on an uploaded volume.",
    responses={
        400: {"description": "Unknown stitcher name"},
        404: {"description": "Volume not found"},
    },
)
async def create_job_endpoint(
    request: JobRequest,
    background_tasks: BackgroundTasks,
) -> JobCreated:
    if not (settings.uploads_dir / f"{request.volume_id}.h5").exists():
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
    )

    return JobCreated(job_id=job_id)


@router.get(
    "/{job_id}",
    response_model=JobStatusResponse,
    summary="Poll job status",
    description="Returns current status, per-stitcher metric results, and error message if failed.",
    responses={404: {"description": "Job not found"}},
)
def get_job_status(job_id: str) -> JobStatusResponse:
    state = get_job(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return JobStatusResponse(status=state.status, results=state.results, error=state.error)
