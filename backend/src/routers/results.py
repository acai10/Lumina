import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from src.config import settings
from src.processing.normalizer import pack_normalized_response
from src.processing.runner import get_job
from src.schemas.enums import JobStatus

router = APIRouter()


@router.get(
    "/{job_id}/volume/{stitcher_name}",
    summary="Download result volume (pre-normalised for frontend)",
    description=(
        "Returns the stitched result volume as a packed binary blob that the frontend "
        "can consume directly without any Web Worker normalization step. "
        "Layout: ``[vIndices float32][vIntensities float32][normalizedVolume uint8]``. "
        "Shape in ``X-Shape`` header; above-threshold voxel count in ``X-VCount``."
    ),
    responses={
        404: {"description": "Job or result not found"},
        409: {"description": "Job not yet completed"},
    },
)
def get_result_volume(job_id: str, stitcher_name: str) -> Response:
    state = get_job(job_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    if state.status != JobStatus.DONE:
        raise HTTPException(status_code=409, detail=f"Job status is '{state.status}', not 'done'.")

    path = settings.uploads_dir / f"{job_id}_{stitcher_name}.npy"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Result volume not found.")

    # Memory-map instead of loading the full volume into RAM: normalize_for_frontend
    # reads it slice by slice, so the OS only keeps a few pages live. Stitcher results
    # are already saved as float32, so no dtype conversion (which would copy) is needed.
    arr: np.ndarray = np.load(path, mmap_mode="r")
    content, headers = pack_normalized_response(arr)
    return Response(content=content, media_type="application/octet-stream", headers=headers)
