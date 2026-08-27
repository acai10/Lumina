"""Routes for getting OCT volumes into the backend and for filtering them.

Two ways in: ``POST /volumes/upload`` takes the file over the wire, while
``/volumes/register`` and ``/volumes/register-batch`` register a file that already
sits under ``settings.data_dir`` by path, which avoids a ~128 MB upload per volume.
Both validate the dataset name and shape and yield the same volume id.

``/volumes/{id}/normalized`` and ``/volumes/{id}/filter`` return the render-ready
packed binary. The filter route is deliberately lean: it applies the chain and
returns the volume in one request, with no stitcher, no metrics and no polling.
"""
import hashlib
import logging
import os
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import Response

from src.config import settings
from src.processing.filters import apply_filter_chain
from src.processing.h5_reader import (
    OCT_DIMS,
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
    """Stream an uploaded ``.h5`` to disk, validate it, and return its new id.

    Args:
        file: Multipart upload; must be a valid HDF5 file with an ``"OCT"``
            dataset of 512×250×250 elements.

    Returns:
        UploadResponse with the fresh volume id and the fixed OCT dimensions.

    Raises:
        HTTPException 400: Not an ``.h5`` upload, not valid HDF5, or wrong shape.
    """
    if not file.filename or not file.filename.lower().endswith(".h5"):
        raise HTTPException(status_code=400, detail="Only .h5 files are accepted.")

    # A fresh UUID per upload: filename stems collide (two different files with
    # the same name would silently replace each other and corrupt open tabs).
    # Registered volumes (see /register) instead derive a deterministic id from
    # the on-disk path so the same file always maps to the same id.
    volume_id = uuid4().hex
    dest = settings.uploads_dir / f"{volume_id}.h5"
    tmp = settings.uploads_dir / f"{volume_id}.h5.part"

    # Stage into a temp file and promote atomically: an aborted or concurrent
    # upload can never leave a half-written file at the final path. Stream in
    # chunks instead of buffering the whole ~128 MB in RAM.
    try:
        with tmp.open("wb") as fh:
            while chunk := await file.read(UPLOAD_CHUNK_SIZE):
                fh.write(chunk)
        validate_volume_file(tmp)  # metadata-only: checks "OCT" dataset + shape
    except (ValueError, OSError) as exc:
        # OSError: h5py raises it for files that are not valid HDF5 at all —
        # that is a client error (bad upload), not a server fault.
        tmp.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        tmp.unlink(missing_ok=True)
        raise
    os.replace(tmp, dest)

    return _upload_response(volume_id)


@router.get(
    "/local",
    response_model=list[LocalVolume],
    summary="List local source volumes",
    description="List `.h5` files available under the server's configured `data_dir`.",
)
def list_local_volumes() -> list[LocalVolume]:
    """List every ``.h5`` under ``settings.data_dir`` (recursively, sorted).

    Returns:
        LocalVolume entries with data_dir-relative path and display name;
        empty list when the directory does not exist.
    """
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
    try:
        source = (root / rel_path).resolve()
    except ValueError as exc:
        # e.g. an embedded NUL byte — a malformed client path, not a server error.
        raise HTTPException(status_code=400, detail="Invalid path.") from exc

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

    # Root-level files keep their plain stem as id (the common, human-friendly
    # case). Files in subdirectories get a short path-derived hash suffix so two
    # tiles named e.g. "a/scan.h5" and "b/scan.h5" cannot collide on the id
    # "scan" — a collision would silently repoint the symlink and serve the
    # wrong data to every tab still holding the old id. The id is deterministic
    # (same relative path → same id), so re-registering reuses the same entry.
    rel = source.relative_to(root)
    if rel.parent == Path("."):
        volume_id = source.stem
    else:
        path_tag = hashlib.sha1(str(rel).encode("utf-8")).hexdigest()[:8]
        volume_id = f"{source.stem}-{path_tag}"
    dest = settings.uploads_dir / f"{volume_id}.h5"
    # Replace any existing entry with a symlink to the source (read-only
    # downstream). Stage the link under a temp name and promote via os.replace
    # (atomic rename) so a concurrent registration of the same volume can never
    # hit the unlink→symlink gap and fail with FileExistsError.
    tmp_link = settings.uploads_dir / f"{volume_id}.h5.lnk"
    tmp_link.unlink(missing_ok=True)
    tmp_link.symlink_to(source)
    os.replace(tmp_link, dest)
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
    """Register one local ``.h5`` under ``data_dir`` by relative path (zero-copy)."""
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
    """Register several local ``.h5`` files in one request (see ``/register``)."""
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
        HTTPException 400: Unknown filter type in the chain.
    """
    path = settings.uploads_dir / f"{volume_id}.h5"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Volume not found.")

    vol = load_volume_flexible(path)
    filter_chain_dicts = [step.model_dump() for step in req.filter_chain]
    try:
        # copy_input=False: every filter allocates its own output, and `vol` is a
        # fresh per-request array, so the defensive upfront copy is redundant.
        filtered = apply_filter_chain(vol, filter_chain_dicts, copy_input=False)
    except ValueError as exc:
        # Unknown filter type — a client error, not a 500.
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    del vol
    content, headers = pack_normalized_response(filtered)
    del filtered
    return Response(content=content, media_type="application/octet-stream", headers=headers)


@router.get(
    "/{volume_id}/normalized",
    summary="Download volume pre-normalised for the frontend",
    description=(
        "Load a stored/registered volume and return the render-ready packed binary "
        "(same layout as job/session results) so the frontend needs neither an upload "
        "nor a Web Worker. Layout: `[vIndices uint32][vIntensities float32]"
        "[normalizedVolume uint8]`; shape in `X-Shape`, voxel count in `X-VCount`."
    ),
    responses={404: {"description": "Volume not found"}},
)
def get_normalized_volume(volume_id: str) -> Response:
    """Return the render-ready packed binary for a stored/registered volume.

    Args:
        volume_id: Stem of a previously uploaded or registered ``.h5`` file.

    Returns:
        Packed binary Response (``X-Shape`` / ``X-VCount`` headers).

    Raises:
        HTTPException 404: Volume not found on disk.
    """
    path = settings.uploads_dir / f"{volume_id}.h5"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Volume not found.")
    # Flexible loader so derived volumes (crops, merges) with non-standard shapes
    # are served too, not only the fixed OCT_DIMS uploads.
    vol = load_volume_flexible(path)
    content, headers = pack_normalized_response(vol)
    return Response(content=content, media_type="application/octet-stream", headers=headers)
