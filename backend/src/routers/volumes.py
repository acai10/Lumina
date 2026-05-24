from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel

from src.config import UPLOADS_DIR
from src.processing.h5_reader import OCT_DIMS, load_volume

router = APIRouter()


class UploadResponse(BaseModel):
    volume_id: str
    n_slices: int
    height: int
    width: int


class VolumeInfo(BaseModel):
    volume_id: str
    shape: list[int]
    dtype: str


@router.post("/upload", response_model=UploadResponse)
async def upload_volume(file: UploadFile) -> UploadResponse:
    if not file.filename or not file.filename.lower().endswith(".h5"):
        raise HTTPException(status_code=400, detail="Only .h5 files are accepted.")

    volume_id = Path(file.filename).stem
    dest = UPLOADS_DIR / f"{volume_id}.h5"

    data = await file.read()
    dest.write_bytes(data)

    try:
        load_volume(dest)  # validates shape and "OCT" dataset
    except ValueError as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    n, h, w = OCT_DIMS
    return UploadResponse(volume_id=volume_id, n_slices=n, height=h, width=w)


@router.get("/{volume_id}/info", response_model=VolumeInfo)
def volume_info(volume_id: str) -> VolumeInfo:
    path = UPLOADS_DIR / f"{volume_id}.h5"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Volume not found.")
    return VolumeInfo(volume_id=volume_id, shape=list(OCT_DIMS), dtype="float32")
