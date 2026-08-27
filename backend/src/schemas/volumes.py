"""Request and response models for the volume endpoints.

Also holds :func:`ensure_path_safe_volume_id`, the guard that keeps a volume id from
escaping the uploads directory via ``..`` or an absolute path. Every route that
turns an id into a filename goes through it.
"""
from pydantic import BaseModel


def ensure_path_safe_volume_id(volume_id: str) -> str:
    """Validate that a client-supplied volume id cannot escape ``uploads_dir``.

    Volume ids arriving in request *bodies* (jobs, sessions) are later joined
    into ``uploads_dir / f"{volume_id}.h5"``; unlike path parameters they may
    contain ``/``, so ``"../data/secret"`` would traverse out of the uploads
    directory. Used as a Pydantic ``field_validator``.

    Args:
        volume_id: The raw id from the request body.

    Returns:
        The id unchanged, if safe.

    Raises:
        ValueError: If the id is empty or contains path separators / dot-dirs
            (surfaces as a 422 validation error).
    """
    if not volume_id or "/" in volume_id or "\\" in volume_id or volume_id in (".", ".."):
        raise ValueError("volume_id must be a bare file stem without path separators")
    return volume_id


class UploadResponse(BaseModel):
    volume_id: str
    n_slices: int
    height: int
    width: int


class LocalVolume(BaseModel):
    """A source ``.h5`` file discovered under ``settings.data_dir``."""

    path: str  # relative to data_dir, e.g. "subdir/scan.h5"
    name: str  # display name (filename)


class RegisterRequest(BaseModel):
    """Register a local source file by path instead of uploading its bytes."""

    path: str  # relative to data_dir


class RegisterBatchRequest(BaseModel):
    """Register several local source files by path in a single request."""

    paths: list[str]  # each relative to data_dir
