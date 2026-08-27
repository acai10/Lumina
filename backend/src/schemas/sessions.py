"""Request and response models for the multi-volume stitching endpoints.

:class:`VolumeEntry` carries a tile's volume id together with its ``(row, col)`` grid
position, which is what lets the session runner know which tiles are neighbours.
"""
from typing import Any

from pydantic import BaseModel, Field, field_validator

from src.schemas.enums import JobStatus
from src.schemas.jobs import FilterStep
from src.schemas.volumes import ensure_path_safe_volume_id


class VolumeEntry(BaseModel):
    """One stitching input: a stored volume id plus its grid position."""

    volume_id: str = Field(description="Id of a previously uploaded/registered volume.")
    row: int = Field(description="Grid row of this tile (0-based).")
    col: int = Field(description="Grid column of this tile (0-based).")

    # Body-supplied ids are joined into an uploads_dir path — reject separators.
    _validate_volume_id = field_validator("volume_id")(ensure_path_safe_volume_id)


class SessionRequest(BaseModel):
    """Body of ``POST /sessions/``: tiles with grid positions + registration method."""

    volumes: list[VolumeEntry]
    method: str = Field(
        default="phase_correlation",
        description="Registration method: phase_correlation or cross_correlation.",
    )
    method_params: dict[str, Any] = Field(
        default_factory=dict,
        description="Reserved for per-method overrides; accepted but currently unused.",
    )


class SessionCreated(BaseModel):
    """Response of ``POST /sessions/``: the id to poll via ``GET /sessions/{id}``."""

    session_id: str


class SessionStatusResponse(BaseModel):
    """Polling response: status, per-volume offsets, quality metrics, merged id."""

    status: JobStatus
    offsets: dict[str, list[float]] = Field(default_factory=dict)
    metrics: dict[str, float] = Field(default_factory=dict)
    merged_volume_id: str | None = None
    error: str | None = None


class SessionFilterRequest(BaseModel):
    """Body of ``POST /sessions/{id}/filter`` — same shape as ``FilterRequest``.

    Kept as a distinct model so the sessions API surface stays self-contained
    and can grow session-specific options without touching the jobs schema.
    """

    filter_chain: list[FilterStep] = Field(default_factory=list)
