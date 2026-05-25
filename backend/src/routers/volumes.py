from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile

from src.config import settings
from src.processing.h5_reader import OCT_DIMS, load_volume
from src.schemas.volumes import UploadResponse, VolumeInfo

router = APIRouter()


@router.post(
    "/upload",
    response_model=UploadResponse,
    summary="Upload OCT volume",
    description="Accept an `.h5` file, validate its shape and OCT dataset, and store it.",
)
async def upload_volume(file: UploadFile) -> UploadResponse:
    if not file.filename or not file.filename.lower().endswith(".h5"):
        raise HTTPException(status_code=400, detail="Only .h5 files are accepted.")

    volume_id = Path(file.filename).stem
    dest = settings.uploads_dir / f"{volume_id}.h5"

    data = await file.read()
    dest.write_bytes(data)

    try:
        load_volume(dest)  # validates shape and "OCT" dataset
    except ValueError as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    n, h, w = OCT_DIMS
    return UploadResponse(volume_id=volume_id, n_slices=n, height=h, width=w)


@router.get(
    "/{volume_id}/info",
    response_model=VolumeInfo,
    summary="Get volume metadata",
    description="Return the shape and dtype for a previously uploaded volume.",
    responses={404: {"description": "Volume not found"}},
)
def volume_info(volume_id: str) -> VolumeInfo:
    path = settings.uploads_dir / f"{volume_id}.h5"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Volume not found.")
    return VolumeInfo(volume_id=volume_id, shape=list(OCT_DIMS), dtype="float32")
