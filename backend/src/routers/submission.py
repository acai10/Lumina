import base64
import logging

from fastapi import APIRouter, HTTPException

from src.config import settings
from src.processing.h5_reader import load_volume_flexible
from src.processing.submission import build_submission, write_submission
from src.processing.volume_cache import load_volume_cached
from src.schemas.submission import SubmissionRequest, SubmissionResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post(
    "/{volume_id}/submission",
    response_model=SubmissionResponse,
    summary="Build a challenge submission from a (stitched) volume",
    description=(
        "Loads the stored OCT volume, extracts the surface depth map (and, for the "
        "tissue dataset, a muscle/fat mask), writes the submission `.h5` in the "
        "required format, and returns base64 PNG previews plus statistics. The 3D "
        "volume is expected to be a stitched result produced by the normal "
        "load + stitch workflow."
    ),
    responses={404: {"description": "Volume not found"}},
)
def build_volume_submission(volume_id: str, req: SubmissionRequest) -> SubmissionResponse:
    path = settings.uploads_dir / f"{volume_id}.h5"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Volume '{volume_id}' not found")

    try:
        volume = load_volume_cached(path, load_volume_flexible)
    except Exception as exc:
        logger.exception("Failed to load volume %s for submission", volume_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    result = build_submission(volume, dx=req.dx, dy=req.dy, dz=req.dz, with_mask=req.tissue)

    h5_name = f"{volume_id}_submission.h5"
    write_submission(
        settings.uploads_dir / h5_name,
        result["surface"],
        req.dx,
        req.dy,
        result["mask"],
    )

    # Persist the PNG previews next to the .h5 as well (handy for the CLI / sharing).
    (settings.uploads_dir / f"{volume_id}_submission_surface.png").write_bytes(
        result["surface_png"]
    )
    if result["mask_png"] is not None:
        (settings.uploads_dir / f"{volume_id}_submission_mask.png").write_bytes(result["mask_png"])

    logger.info("Built submission for %s: %s %s", volume_id, h5_name, result["stats"])
    return SubmissionResponse(
        volume_id=volume_id,
        h5_filename=h5_name,
        surface_png=base64.b64encode(result["surface_png"]).decode("ascii"),
        mask_png=(
            base64.b64encode(result["mask_png"]).decode("ascii")
            if result["mask_png"] is not None
            else None
        ),
        stats=result["stats"],
    )
