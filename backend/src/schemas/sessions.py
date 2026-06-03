from typing import Any

from pydantic import BaseModel, Field

from src.schemas.enums import JobStatus
from src.schemas.jobs import FilterStep


class VolumeEntry(BaseModel):
    volume_id: str
    row: int
    col: int


class SessionRequest(BaseModel):
    volumes: list[VolumeEntry]
    method: str = "phase_correlation"
    method_params: dict[str, Any] = Field(default_factory=dict)


class SessionCreated(BaseModel):
    session_id: str


class SessionStatusResponse(BaseModel):
    status: JobStatus
    offsets: dict[str, list[float]] = Field(default_factory=dict)
    metrics: dict[str, float] = Field(default_factory=dict)
    merged_volume_id: str | None = None
    error: str | None = None


class SessionFilterRequest(BaseModel):
    filter_chain: list[FilterStep] = Field(default_factory=list)
