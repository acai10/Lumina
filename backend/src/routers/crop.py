import logging
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.config import settings
from src.processing.h5_reader import load_volume_flexible, save_oct_volume
from src.processing.volume_cache import load_volume_cached
from src.schemas.volumes import UploadResponse

logger = logging.getLogger(__name__)

router = APIRouter()


class CropRequest(BaseModel):
    """Axis-aligned bounding box in source-volume voxel coordinates.

    Axes follow the volume layout ``(z, y, x)`` = ``(nSlices, height, width)``:
    ``x`` indexes width, ``y`` indexes height, ``z`` indexes slices.
    """

    x: int = Field(ge=0)
    y: int = Field(ge=0)
    z: int = Field(ge=0)
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    depth: int = Field(ge=1)


@router.post(
    "/volumes/{volume_id}/crop",
    response_model=UploadResponse,
    summary="Extract a sub-volume crop as a new independent volume",
)
def crop_volume(volume_id: str, req: CropRequest) -> UploadResponse:
    """Extract an axis-aligned sub-volume and persist it as a brand-new volume.

    The crop is non-destructive: the source file is only read, and the extracted
    sub-volume is written to a fresh ``.h5`` under ``uploads_dir`` with a new id.
    The frontend can then treat the returned id exactly like any uploaded volume
    (normalize, filter, segment, measure). The persisted file plus the volume
    cache mean the sub-volume is not re-extracted on subsequent requests.

    Args:
        volume_id: UUID/stem of the source volume to crop.
        req: Bounding box (origin x/y/z + width/height/depth) in voxel coords.

    Returns:
        UploadResponse for the new crop volume with its actual cropped dimensions.

    Raises:
        HTTPException 404: Source volume not found.
        HTTPException 422: Bounding box falls outside the source volume.
    """
    path = settings.uploads_dir / f"{volume_id}.h5"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Volume '{volume_id}' not found")

    try:
        volume = load_volume_cached(path, load_volume_flexible)
    except Exception as exc:
        logger.exception("Failed to load volume %s for crop", volume_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    n_slices, vol_h, vol_w = volume.shape
    if req.z + req.depth > n_slices or req.y + req.height > vol_h or req.x + req.width > vol_w:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Crop box exceeds volume bounds {volume.shape} "
                f"(z {req.z}+{req.depth}, y {req.y}+{req.height}, x {req.x}+{req.width})"
            ),
        )

    sub = volume[
        req.z : req.z + req.depth,
        req.y : req.y + req.height,
        req.x : req.x + req.width,
    ]
    # Copy so the new file owns contiguous data independent of the cached source.
    sub = sub.copy()

    new_id = uuid.uuid4().hex
    dest = settings.uploads_dir / f"{new_id}.h5"
    save_oct_volume(dest, sub)
    logger.info(
        "Cropped volume %s %s -> %s shape %s", volume_id, volume.shape, new_id, sub.shape
    )

    d, h, w = sub.shape
    return UploadResponse(volume_id=new_id, n_slices=d, height=h, width=w)
