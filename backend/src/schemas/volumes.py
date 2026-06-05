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


class LocalVolume(BaseModel):
    """A source ``.h5`` file discovered under ``settings.data_dir``."""

    path: str  # relative to data_dir, e.g. "subdir/scan.h5"
    name: str  # display name (filename)


class RegisterRequest(BaseModel):
    """Register a local source file by path instead of uploading its bytes."""

    path: str  # relative to data_dir
