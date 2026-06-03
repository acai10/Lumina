import uuid

import numpy as np
from fastapi import APIRouter, BackgroundTasks, HTTPException, Response

from src.config import settings
from src.processing.filters import apply_filter_chain
from src.processing.h5_reader import load_volume_flexible
from src.processing.normalizer import load_packed, normalize_for_frontend, pack_normalized_response
from src.processing.session_runner import run_session, session_store
from src.schemas.sessions import (
    SessionCreated,
    SessionFilterRequest,
    SessionRequest,
    SessionStatusResponse,
)

router = APIRouter()


@router.post(
    "/",
    response_model=SessionCreated,
    status_code=201,
    summary="Create multi-volume stitching session",
    description=(
        "Upload volume IDs with grid positions and start a background stitching job. "
        "Poll ``GET /sessions/{id}`` for status."
    ),
)
async def create_session(req: SessionRequest, background_tasks: BackgroundTasks) -> SessionCreated:
    if len(req.volumes) < 2:
        raise HTTPException(status_code=400, detail="At least 2 volumes are required.")

    session_id = str(uuid.uuid4())
    session_store.create(session_id)

    volume_entries = [{"volume_id": v.volume_id, "row": v.row, "col": v.col} for v in req.volumes]

    background_tasks.add_task(
        run_session,
        session_id,
        volume_entries,
        req.method,
        req.method_params,
    )

    return SessionCreated(session_id=session_id)


@router.get(
    "/{session_id}",
    response_model=SessionStatusResponse,
    summary="Poll stitching session status",
    responses={404: {"description": "Session not found"}},
)
def get_session(session_id: str) -> SessionStatusResponse:
    state = session_store.get(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    return SessionStatusResponse(
        status=state.status,
        offsets=state.offsets,
        metrics=state.metrics,
        merged_volume_id=state.merged_volume_id,
        error=state.error,
    )


@router.get(
    "/{session_id}/mip",
    summary="Get Maximum Intensity Projection of stitched volume",
    description="Returns raw float32 bytes; shape in ``X-Shape`` header (height,width).",
    responses={
        404: {"description": "Session or MIP not found"},
        202: {"description": "Session not yet complete"},
    },
)
def get_session_mip(session_id: str) -> Response:
    state = session_store.get(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    path = settings.uploads_dir / f"{session_id}_mip.npy"
    if not path.exists():
        raise HTTPException(status_code=404, detail="MIP not available yet.")

    mip: np.ndarray = np.load(path)
    return Response(
        content=mip.astype(np.float32).tobytes(),
        media_type="application/octet-stream",
        headers={"X-Shape": ",".join(str(d) for d in mip.shape)},
    )


@router.get(
    "/{session_id}/merged",
    summary="Get merged OCT volume",
    description=(
        "Returns the full 3-D merged volume as raw float32 bytes; "
        "shape in ``X-Shape`` header (n_slices,height,width)."
    ),
    responses={404: {"description": "Session or merged volume not found"}},
)
def get_session_merged(session_id: str) -> Response:
    state = session_store.get(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    path = settings.uploads_dir / f"{session_id}_merged.npy"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Merged volume not available yet.")

    # Fast path: serve the binary that was pre-computed during session processing.
    content, headers = load_packed(settings.uploads_dir / f"{session_id}_frontend")
    if content is not None and headers is not None:
        return Response(content=content, media_type="application/octet-stream", headers=headers)

    # Fallback: compute on-demand (slow; reached only for sessions created before
    # the pre-computation was added, or if the runner crashed mid-way).
    vol: np.ndarray = np.load(path).astype(np.float32)
    content, headers = pack_normalized_response(vol)
    return Response(content=content, media_type="application/octet-stream", headers=headers)


@router.post(
    "/{session_id}/filter",
    summary="Apply a filter chain to the merged volume",
    description=(
        "Loads the session's merged HDF5 volume, applies the requested filter chain, "
        "and returns the result as raw float32 bytes with an ``X-Shape`` header."
    ),
    responses={404: {"description": "Merged volume not found"}},
)
def filter_session_merged(session_id: str, req: SessionFilterRequest) -> Response:
    path = settings.uploads_dir / f"{session_id}_merged.h5"
    if not path.exists():
        raise HTTPException(
            status_code=404,
            detail="Merged volume HDF5 not found. Re-run stitching to generate it.",
        )

    # Prefer the .npy memory-map so the OS keeps only accessed pages in RAM
    # (~50 MB of page cache) rather than loading the full 1 GB volume.
    npy_path = settings.uploads_dir / f"{session_id}_merged.npy"
    if npy_path.exists():
        vol = np.load(str(npy_path), mmap_mode="r")
    else:
        vol = load_volume_flexible(path)

    filter_chain_dicts = [step.model_dump() for step in req.filter_chain]

    # copy_input=False skips the 1 GB upfront copy inside apply_filter_chain —
    # all filter functions allocate their own output array; the copy is redundant
    # when the caller owns a fresh temporary (as we do here).
    filtered = apply_filter_chain(vol, filter_chain_dicts, copy_input=False).astype(np.float32)
    del vol  # release mmap / free input before normalization

    v_indices, v_intensities, norm_u8 = normalize_for_frontend(filtered)
    del filtered  # free 1 GB before assembling the response

    content = v_indices.tobytes() + v_intensities.tobytes() + norm_u8.tobytes()
    nSlices, H, W = norm_u8.shape
    headers = {"X-Shape": f"{nSlices},{H},{W}", "X-VCount": str(len(v_indices))}
    return Response(content=content, media_type="application/octet-stream", headers=headers)
