"""Route for computing geometric measurements of a volume.

A thin wrapper over :func:`src.processing.measurements.compute_measurements`: it
resolves the volume id, passes the caller's threshold and voxel size through, and
returns the measurements in physical units.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.processing.measurements import compute_measurements
from src.routers.common import load_volume_or_404

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
    volume = load_volume_or_404(volume_id)

    try:
        result = compute_measurements(
            volume,
            threshold=req.threshold,
            voxel_size_um=req.voxel_size_um,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    # model_validate instead of **kwargs: the computation returns a plain dict
    # annotated dict[str, float]; Pydantic coerces/validates voxel_count to int.
    return MeasureResponse.model_validate(result)
