import base64
import logging

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.config import settings
from src.processing.h5_reader import load_volume_flexible
from src.processing.submission import (
    _mask_to_png,
    build_submission,
    segment_muscle_fat,
    write_submission,
)
from src.processing.volume_cache import load_volume_cached
from src.schemas.submission import SubmissionRequest, SubmissionResponse

logger = logging.getLogger(__name__)

router = APIRouter()


class MaskResponse(BaseModel):
    """Standalone muscle/fat segmentation preview for a single volume."""

    volume_id: str
    mask_png: str = Field(description="Base64-encoded PNG of the binary mask.")
    stats: dict[str, float] = Field(default_factory=dict)


def _load_volume_or_404(volume_id: str) -> np.ndarray:
    """Load a stored volume by id, raising 404/500 like the other volume routes."""
    path = settings.uploads_dir / f"{volume_id}.h5"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Volume '{volume_id}' not found")
    try:
        return load_volume_cached(path, load_volume_flexible)
    except Exception as exc:
        logger.exception("Failed to load volume %s", volume_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc


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
    volume = _load_volume_or_404(volume_id)

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


@router.post(
    "/{volume_id}/mask",
    response_model=MaskResponse,
    summary="Segment a volume into a binary muscle/fat mask (preview only)",
    description=(
        "Loads the stored OCT volume and returns a standalone muscle/fat "
        "segmentation as a base64 PNG plus the muscle fraction. Unlike "
        "`/submission` this writes no files and needs no stitch/tissue flag — it "
        "exposes the Otsu segmentation for any single volume on its own."
    ),
    responses={404: {"description": "Volume not found"}},
)
def segment_volume_mask(volume_id: str) -> MaskResponse:
    volume = _load_volume_or_404(volume_id)
    mask = segment_muscle_fat(volume)
    muscle_pct = round(float((mask >= 0.5).mean()) * 100.0, 1)
    logger.info("Segmented mask for %s: muscle=%.1f%%", volume_id, muscle_pct)
    return MaskResponse(
        volume_id=volume_id,
        mask_png=base64.b64encode(_mask_to_png(mask)).decode("ascii"),
        stats={
            "muscle_pct": muscle_pct,
            "height": float(mask.shape[0]),
            "width": float(mask.shape[1]),
        },
    )
