import base64
import logging

import numpy as np
from fastapi import APIRouter, HTTPException

from src.config import settings
from src.processing.h5_reader import load_volume_flexible
from src.processing.submission import (
    build_submission,
    mask_to_png,
    segment_muscle_fat,
    write_submission,
)
from src.processing.volume_cache import load_volume_cached
from src.schemas.submission import MaskResponse, SubmissionRequest, SubmissionResponse

logger = logging.getLogger(__name__)

router = APIRouter()


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
    """Build the challenge ``.h5`` (+ PNG previews) for a stored volume.

    Args:
        volume_id: Id of the (usually stitched) volume to build from.
        req: Tissue flag and voxel spacing in mm.

    Returns:
        SubmissionResponse with the written filename, base64 previews, and stats.

    Raises:
        HTTPException 404: Volume not found.
    """
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
    mask_png_path = settings.uploads_dir / f"{volume_id}_submission_mask.png"
    if result["mask_png"] is not None:
        mask_png_path.write_bytes(result["mask_png"])
    else:
        # A previous tissue=true build may have left a mask preview behind —
        # remove it so the on-disk previews always match the latest build.
        mask_png_path.unlink(missing_ok=True)

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
    """Return a standalone Otsu muscle/fat segmentation preview (no files written).

    Args:
        volume_id: Id of the stored volume to segment.

    Returns:
        MaskResponse with a base64 PNG and the muscle fraction.

    Raises:
        HTTPException 404: Volume not found.
    """
    volume = _load_volume_or_404(volume_id)
    mask = segment_muscle_fat(volume)
    muscle_pct = round(float((mask >= 0.5).mean()) * 100.0, 1)
    logger.info("Segmented mask for %s: muscle=%.1f%%", volume_id, muscle_pct)
    return MaskResponse(
        volume_id=volume_id,
        mask_png=base64.b64encode(mask_to_png(mask)).decode("ascii"),
        stats={
            "muscle_pct": muscle_pct,
            "height": float(mask.shape[0]),
            "width": float(mask.shape[1]),
        },
    )
