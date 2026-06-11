import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.config import settings
from src.processing.h5_reader import load_volume_flexible
from src.processing.measurements import compute_measurements
from src.processing.volume_cache import load_volume_cached

logger = logging.getLogger(__name__)

router = APIRouter()


class MeasureRequest(BaseModel):
    threshold: float = Field(default=0.05, ge=0.0, le=1.0)
    voxel_size_um: tuple[float, float, float] = Field(
        default=(1.0, 1.0, 1.0),
        description="Physical voxel size in µm as (dz, dy, dx).",
    )


class MeasureResponse(BaseModel):
    voxel_count: int
    volume_um3: float
    surface_area_um2: float
    mean_thickness_um: float
    max_thickness_um: float
    lateral_diameter_um: float


@router.post(
    "/volumes/{volume_id}/measure",
    response_model=MeasureResponse,
    summary="Compute geometric measurements for a volume",
)
async def measure_volume(volume_id: str, req: MeasureRequest) -> MeasureResponse:
    """Compute area, volume, thickness and diameter of the tissue region.

    Args:
        volume_id: UUID of a previously uploaded or registered volume.
        req: Threshold and physical voxel spacing used for the measurement.

    Returns:
        MeasureResponse with all geometric metrics.

    Raises:
        HTTPException 404: Volume not found on disk.
    """
    path = settings.uploads_dir / f"{volume_id}.h5"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Volume '{volume_id}' not found")

    try:
        volume = load_volume_cached(path, load_volume_flexible)
    except Exception as exc:
        logger.exception("Failed to load volume %s for measurement", volume_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    try:
        result = compute_measurements(
            volume,
            threshold=req.threshold,
            voxel_size_um=req.voxel_size_um,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return MeasureResponse(**result)
