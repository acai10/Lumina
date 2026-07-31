from typing import Any

from pydantic import BaseModel, Field, field_validator

from src.schemas.enums import JobStatus
from src.schemas.volumes import ensure_path_safe_volume_id


class FilterStep(BaseModel):
    """One step of a preprocessing chain: a filter name plus its parameters."""

    type: str = Field(description="Filter name: gaussian, median, mean, normalize, or edge.")
    params: dict[str, Any] = Field(
        default_factory=dict, description="Filter-specific parameters (e.g. sigma, size)."
    )


class FilterRequest(BaseModel):
    """Body of the lean filter endpoints: an ordered chain of filter steps."""

    filter_chain: list[FilterStep] = Field(default_factory=list)


class JobRequest(BaseModel):
    """Body of ``POST /jobs/``: volume, filter chain, and stitchers to compare."""

    volume_id: str = Field(description="Id of a previously uploaded/registered volume.")
    filter_chain: list[FilterStep] = Field(default_factory=list)
    stitchers: list[str] = Field(
        description="Stitcher names to run (see STITCHER_REGISTRY); validated on create."
    )
    stitcher_params: dict[str, dict[str, Any]] = Field(default_factory=dict)

    # Body-supplied ids are joined into an uploads_dir path — reject separators.
    _validate_volume_id = field_validator("volume_id")(ensure_path_safe_volume_id)


class JobCreated(BaseModel):
    """Response of ``POST /jobs/``: the id to poll via ``GET /jobs/{id}``."""

    job_id: str


class JobStatusResponse(BaseModel):
    """Polling response: job status plus per-stitcher metric results."""

    status: JobStatus
    results: dict[str, Any] = Field(
        default_factory=dict,
        description="Per-stitcher quality metrics, or {'error': ...} for a failed stitcher.",
    )
    error: str | None = None
