"""Request and response models for the challenge submission endpoint.

The response carries the built file's path, the summary statistics and the base64
PNG previews, so the UI can show the surface map and the mask before submitting.
"""
from typing import Any

from pydantic import BaseModel, Field

from src.processing.submission import DEFAULT_DX_MM, DEFAULT_DY_MM, DEFAULT_DZ_MM


class SubmissionRequest(BaseModel):
    """Parameters for building a challenge submission from a stored volume."""

    #: Tissue dataset -> also produce a binary muscle/fat ``mask``.
    tissue: bool = False
    #: Voxel spacing in mm (defaults mirror Lumina's DEFAULT_VOXEL_SIZE_UM).
    dx: float = Field(default=DEFAULT_DX_MM, gt=0)
    dy: float = Field(default=DEFAULT_DY_MM, gt=0)
    dz: float = Field(default=DEFAULT_DZ_MM, gt=0)


class SubmissionResponse(BaseModel):
    """Result of building a submission: file name, PNG previews, and stats."""

    volume_id: str
    h5_filename: str
    #: Base64-encoded PNG of the surface depth map.
    surface_png: str
    #: Base64-encoded PNG of the mask (``None`` for phantom datasets).
    mask_png: str | None = None
    stats: dict[str, Any]
