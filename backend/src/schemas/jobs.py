from typing import Any

from pydantic import BaseModel, Field

from src.schemas.enums import JobStatus


class FilterStep(BaseModel):
    type: str
    params: dict[str, Any] = Field(default_factory=dict)


class FilterRequest(BaseModel):
    filter_chain: list[FilterStep] = Field(default_factory=list)


class JobRequest(BaseModel):
    volume_id: str
    filter_chain: list[FilterStep] = Field(default_factory=list)
    stitchers: list[str]
    stitcher_params: dict[str, dict[str, Any]] = Field(default_factory=dict)


class JobCreated(BaseModel):
    job_id: str


class JobStatusResponse(BaseModel):
    status: JobStatus
    results: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None
