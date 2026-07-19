import logging
import uuid
from typing import Literal

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.config import settings
from src.processing.h5_reader import save_oct_volume
from src.routers.common import load_volume_or_404
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
    #: Region shape. 'rect' keeps the full box; 'cylinder' zeroes voxels outside the
    #: ellipse inscribed in the x/y footprint (extruded along z); 'sphere' zeroes
    #: voxels outside the ellipsoid inscribed in the box. The mask is baked into the
    #: stored crop so downstream filtering/measurement stay within the shape.
    shape: Literal["rect", "cylinder", "sphere"] = "rect"


def _apply_shape_mask(sub: np.ndarray, shape: str) -> None:
    """Zero voxels outside the inscribed cylinder/ellipsoid, in place. No-op for 'rect'."""
    if shape == "rect":
        return
    d, h, w = sub.shape
    zz, yy, xx = np.ogrid[0:d, 0:h, 0:w]
    rx = max(w / 2, 1e-6)
    ry = max(h / 2, 1e-6)
    rz = max(d / 2, 1e-6)
    ex = ((xx - (w - 1) / 2) / rx) ** 2
    ey = ((yy - (h - 1) / 2) / ry) ** 2
    if shape == "cylinder":
        outside = ex + ey > 1.0  # shape (1, h, w) → broadcasts over z
    else:  # sphere (ellipsoid filling the box)
        ez = ((zz - (d - 1) / 2) / rz) ** 2
        outside = ex + ey + ez > 1.0
    sub[np.broadcast_to(outside, sub.shape)] = 0


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
    volume = load_volume_or_404(volume_id)

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
    # Bake the region shape into the stored crop so later filtering / measurement
    # operate on the masked sub-volume rather than the full bounding box.
    _apply_shape_mask(sub, req.shape)

    new_id = uuid.uuid4().hex
    dest = settings.uploads_dir / f"{new_id}.h5"
    save_oct_volume(dest, sub)
    logger.info("Cropped volume %s %s -> %s shape %s", volume_id, volume.shape, new_id, sub.shape)

    d, h, w = sub.shape
    return UploadResponse(volume_id=new_id, n_slices=d, height=h, width=w)
