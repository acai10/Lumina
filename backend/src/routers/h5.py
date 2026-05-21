import hashlib
from typing import List

from fastapi import APIRouter, HTTPException, UploadFile
from pydantic import BaseModel

from src.imaging.h5_reader import load_volume, slice_to_base64, volume_to_slices

router = APIRouter()

_volume_cache: dict = {}


class UploadResponse(BaseModel):
    n_slices: int
    height: int
    width: int
    slices: List[str]


class SliceResponse(BaseModel):
    slice_index: int
    image: str


@router.post("/upload", response_model=UploadResponse)
async def upload_h5(file: UploadFile) -> UploadResponse:
    data = await file.read()
    key = hashlib.sha256(data).hexdigest()

    if key not in _volume_cache:
        try:
            volume = load_volume(data)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Failed to read .h5 file: {exc}") from exc
        # Single-volume memory management: evict previous volume before storing new one.
        _volume_cache.clear()
        _volume_cache[key] = volume
        _volume_cache["_current_key"] = key

    volume = _volume_cache[key]
    n_slices, height, width = volume.shape
    slices = volume_to_slices(volume)

    return UploadResponse(n_slices=n_slices, height=height, width=width, slices=slices)


@router.get("/slice/{index}", response_model=SliceResponse)
def get_slice(index: int) -> SliceResponse:
    key = _volume_cache.get("_current_key")
    if key is None or key not in _volume_cache:
        raise HTTPException(status_code=404, detail="No volume loaded. Upload a .h5 file first.")

    volume = _volume_cache[key]
    n_slices = volume.shape[0]

    if index < 0 or index >= n_slices:
        raise HTTPException(
            status_code=400, detail=f"Index {index} out of range [0, {n_slices - 1}]"
        )

    return SliceResponse(slice_index=index, image=slice_to_base64(volume[index]))
