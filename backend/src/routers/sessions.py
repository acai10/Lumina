import uuid

import numpy as np
from fastapi import APIRouter, BackgroundTasks, HTTPException, Response

from src.config import settings
from src.processing.session_runner import run_session, session_store
from src.schemas.sessions import SessionCreated, SessionRequest, SessionStatusResponse

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

    vol: np.ndarray = np.load(path)
    return Response(
        content=vol.astype(np.float32).tobytes(),
        media_type="application/octet-stream",
        headers={"X-Shape": ",".join(str(d) for d in vol.shape)},
    )
