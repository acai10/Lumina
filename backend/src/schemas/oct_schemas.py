from pydantic import BaseModel


class UploadResponse(BaseModel):
    scan_type: str
    n_slices: int
    width: int
    height: int
    preview: str  # base64 PNG


class SliceResponse(BaseModel):
    slice_index: int
    image: str  # base64 PNG


class AScanResponse(BaseModel):
    signal: list[float]
    depth_axis: list[float]
