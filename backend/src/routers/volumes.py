import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import Response

from src.config import settings
from src.processing.h5_reader import OCT_DIMS, load_volume, validate_volume_file
from src.processing.normalizer import pack_normalized_response
from src.schemas.volumes import (
    LocalVolume,
    RegisterRequest,
    UploadResponse,
    VolumeInfo,
)

logger = logging.getLogger(__name__)

router = APIRouter()

#: Streamed-upload chunk size — bounds peak memory regardless of file size.
UPLOAD_CHUNK_SIZE = 1024 * 1024  # 1 MB


def _upload_response(volume_id: str) -> UploadResponse:
    n, h, w = OCT_DIMS
    return UploadResponse(volume_id=volume_id, n_slices=n, height=h, width=w)


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

    # Unlink first so we never write *through* a symlink onto a registered source
    # file (see /register); this always creates a fresh regular file. Then stream
    # the upload in chunks instead of buffering the whole ~128 MB in RAM.
    dest.unlink(missing_ok=True)
    with dest.open("wb") as fh:
        while chunk := await file.read(UPLOAD_CHUNK_SIZE):
            fh.write(chunk)

    try:
        validate_volume_file(dest)  # metadata-only: checks "OCT" dataset + shape
    except ValueError as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _upload_response(volume_id)


@router.get(
    "/local",
    response_model=list[LocalVolume],
    summary="List local source volumes",
    description="List `.h5` files available under the server's configured `data_dir`.",
)
def list_local_volumes() -> list[LocalVolume]:
    root = settings.data_dir
    if not root.is_dir():
        return []
    volumes = [
        LocalVolume(path=str(p.relative_to(root)), name=p.name)
        for p in sorted(root.rglob("*.h5"))
        if p.is_file()
    ]
    return volumes


@router.post(
    "/register",
    response_model=UploadResponse,
    summary="Register a local volume by path (no upload)",
    description=(
        "Reference an existing `.h5` file under `data_dir` by relative path instead "
        "of uploading its bytes. Creates a symlink in `uploads_dir` (zero-copy); the "
        "original file is only ever read, never modified."
    ),
    responses={
        400: {"description": "Invalid path or volume"},
        404: {"description": "File not found"},
    },
)
def register_volume(req: RegisterRequest) -> UploadResponse:
    root = settings.data_dir.resolve()
    source = (root / req.path).resolve()

    # Path-traversal guard: the resolved path must stay within data_dir.
    if not source.is_relative_to(root):
        raise HTTPException(status_code=400, detail="Path escapes data_dir.")
    if source.suffix.lower() != ".h5":
        raise HTTPException(status_code=400, detail="Only .h5 files are accepted.")
    if not source.is_file():
        raise HTTPException(status_code=404, detail="File not found.")

    try:
        validate_volume_file(source)
    except (ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    volume_id = source.stem
    dest = settings.uploads_dir / f"{volume_id}.h5"
    # Replace any existing entry with a symlink to the source (read-only downstream).
    dest.unlink(missing_ok=True)
    dest.symlink_to(source)
    logger.info("Registered local volume %s -> %s", volume_id, source)

    return _upload_response(volume_id)


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


@router.get(
    "/{volume_id}/normalized",
    summary="Download volume pre-normalised for the frontend",
    description=(
        "Load a stored/registered volume and return the render-ready packed binary "
        "(same layout as job/session results) so the frontend needs neither an upload "
        "nor a Web Worker. Layout: `[vIndices float32][vIntensities float32]"
        "[normalizedVolume uint8]`; shape in `X-Shape`, voxel count in `X-VCount`."
    ),
    responses={404: {"description": "Volume not found"}},
)
def get_normalized_volume(volume_id: str) -> Response:
    path = settings.uploads_dir / f"{volume_id}.h5"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Volume not found.")
    vol = load_volume(path)
    content, headers = pack_normalized_response(vol)
    return Response(content=content, media_type="application/octet-stream", headers=headers)
