import base64
import logging

from fastapi import APIRouter

from src.config import settings
from src.processing.submission import SubmissionBuild, build_submission, write_submission
from src.routers.common import load_volume_or_404
from src.schemas.submission import SubmissionRequest, SubmissionResponse

logger = logging.getLogger(__name__)

router = APIRouter()


def _persist_submission_files(
    volume_id: str, req: SubmissionRequest, build: SubmissionBuild
) -> str:
    """Write the challenge ``.h5`` plus PNG previews to ``uploads_dir``.

    Args:
        volume_id: Source volume id (used as filename prefix).
        req: The request carrying the voxel spacings.
        build: The computed submission artefacts.

    Returns:
        The written ``.h5`` filename.
    """
    h5_name = f"{volume_id}_submission.h5"
    write_submission(settings.uploads_dir / h5_name, build.surface, req.dx, req.dy, build.mask)

    # Persist the PNG previews next to the .h5 as well (handy for the CLI / sharing).
    (settings.uploads_dir / f"{volume_id}_submission_surface.png").write_bytes(build.surface_png)
    mask_png_path = settings.uploads_dir / f"{volume_id}_submission_mask.png"
    if build.mask_png is not None:
        mask_png_path.write_bytes(build.mask_png)
    else:
        # A previous tissue=true build may have left a mask preview behind —
        # remove it so the on-disk previews always match the latest build.
        mask_png_path.unlink(missing_ok=True)
    return h5_name


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
    volume = load_volume_or_404(volume_id)
    build = build_submission(volume, dx=req.dx, dy=req.dy, dz=req.dz, with_mask=req.tissue)
    h5_name = _persist_submission_files(volume_id, req, build)

    logger.info("Built submission for %s: %s %s", volume_id, h5_name, build.stats)
    return SubmissionResponse(
        volume_id=volume_id,
        h5_filename=h5_name,
        surface_png=base64.b64encode(build.surface_png).decode("ascii"),
        mask_png=(
            base64.b64encode(build.mask_png).decode("ascii") if build.mask_png is not None else None
        ),
        stats=build.stats,
    )
