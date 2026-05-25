from pydantic import BaseModel


class UploadResponse(BaseModel):
    volume_id: str
    n_slices: int
    height: int
    width: int


class VolumeInfo(BaseModel):
    volume_id: str
    shape: list[int]
    dtype: str
