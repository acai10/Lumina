import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import Response

from src.config import settings
from src.processing.filters import apply_filter_chain
from src.processing.h5_reader import (
    OCT_DIMS,
    load_volume,
    load_volume_flexible,
    validate_volume_file,
)
from src.processing.normalizer import pack_normalized_response
from src.schemas.jobs import FilterRequest
from src.schemas.volumes import (
    LocalVolume,
    RegisterBatchRequest,
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


def _register_local(rel_path: str) -> UploadResponse:
    """Validate a data_dir-relative path and symlink it into uploads_dir.

    Args:
        rel_path: Path to the source ``.h5`` relative to ``settings.data_dir``.

    Returns:
        UploadResponse for the registered volume.

    Raises:
        HTTPException: 400 for invalid path/volume, 404 if the file is missing.
    """
    root = settings.data_dir.resolve()
    source = (root / rel_path).resolve()

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
    return _register_local(req.path)


@router.post(
    "/register-batch",
    response_model=list[UploadResponse],
    summary="Register several local volumes by path (no upload)",
    description=(
        "Register multiple existing `.h5` files under `data_dir` in one request, "
        "avoiding an N+1 storm when adding many tiles (e.g. a stitch grid)."
    ),
    responses={
        400: {"description": "Invalid path or volume"},
        404: {"description": "File not found"},
    },
)
def register_volumes_batch(req: RegisterBatchRequest) -> list[UploadResponse]:
    return [_register_local(p) for p in req.paths]


@router.post(
    "/{volume_id}/filter",
    summary="Apply a filter chain to a volume (no stitching, no metrics)",
    description=(
        "Load a stored/registered volume, apply the requested filter chain in order, "
        "and return the render-ready normalised binary (same layout as "
        "`/{id}/normalized`). This is the lean preprocessing path: it performs no "
        "registration/stitching and computes no quality metrics, so the result is the "
        "filtered volume exactly as-is — fast and positionally unchanged."
    ),
    responses={404: {"description": "Volume not found"}},
)
def filter_volume(volume_id: str, req: FilterRequest) -> Response:
    """Apply *req.filter_chain* to a volume and return the normalised binary.

    Args:
        volume_id: Stem of a previously uploaded or registered ``.h5`` file.
        req: The ordered filter chain to apply.

    Returns:
        Render-ready packed binary Response (``X-Shape`` / ``X-VCount`` headers).

    Raises:
        HTTPException 404: Volume not found on disk.
    """
    path = settings.uploads_dir / f"{volume_id}.h5"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Volume not found.")

    vol = load_volume_flexible(path)
    filter_chain_dicts = [step.model_dump() for step in req.filter_chain]
    # copy_input=False: every filter allocates its own output, and `vol` is a fresh
    # per-request array, so the defensive upfront copy is redundant.
    filtered = apply_filter_chain(vol, filter_chain_dicts, copy_input=False)
    del vol
    content, headers = pack_normalized_response(filtered)
    del filtered
    return Response(content=content, media_type="application/octet-stream", headers=headers)


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
