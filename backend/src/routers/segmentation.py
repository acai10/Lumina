import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from src.config import settings
from src.processing.h5_reader import load_volume_flexible
from src.processing.multi_volume import segment_surface
from src.processing.volume_cache import load_volume_cached

logger = logging.getLogger(__name__)

router = APIRouter()

_DEFAULT_THRESHOLD = 0.05


@router.post(
    "/volumes/{volume_id}/segment",
    summary="Segment the OCT surface for a volume",
    response_class=Response,
)
async def segment_volume(volume_id: str, threshold: float = _DEFAULT_THRESHOLD) -> Response:
    """Compute a surface height map for the given volume.

    Returns the height map as a flat little-endian int32 binary blob.  The
    ``X-Shape`` response header carries the 2-D shape as ``height,width`` so
    the client can reconstruct the array without a separate info call.

    Args:
        volume_id: UUID of a previously uploaded or registered volume.
        threshold: Minimum intensity to be considered surface (default 0.05).

    Returns:
        200 binary response: int32 flat array of shape (height × width).

    Raises:
        HTTPException 404: Volume file not found on disk.
        HTTPException 422: threshold is out of the valid [0, 1] range.
    """
    if not (0.0 <= threshold <= 1.0):
        raise HTTPException(status_code=422, detail="threshold must be in [0, 1]")

    path = settings.uploads_dir / f"{volume_id}.h5"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Volume '{volume_id}' not found")

    try:
        volume = load_volume_cached(path, load_volume_flexible)
    except Exception as exc:
        logger.exception("Failed to load volume %s for segmentation", volume_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    height_map = segment_surface(volume, threshold=threshold)
    payload = height_map.astype("<i4").tobytes()
    h, w = height_map.shape

    return Response(
        content=payload,
        media_type="application/octet-stream",
        headers={"X-Shape": f"{h},{w}"},
    )
