"""Small helpers shared by the volume-consuming routers (crop, measure, submission)."""

import logging

import numpy as np
from fastapi import HTTPException

from src.config import settings
from src.processing.h5_reader import load_volume_flexible
from src.processing.volume_cache import load_volume_cached

logger = logging.getLogger(__name__)


def load_volume_or_404(volume_id: str) -> np.ndarray:
    """Load a stored volume by id, translating failures into HTTP errors.

    Args:
        volume_id: Stem of a previously uploaded/registered ``.h5`` in
            ``uploads_dir``.

    Returns:
        The decoded volume (served from the LRU cache when possible; treat as
        read-only — the array may be shared with other requests).

    Raises:
        HTTPException 404: No such volume on disk.
        HTTPException 500: The file exists but could not be decoded.
    """
    path = settings.uploads_dir / f"{volume_id}.h5"
    if not path.exists():
        raise HTTPException(status_code=404, detail=f"Volume '{volume_id}' not found")
    try:
        return load_volume_cached(path, load_volume_flexible)
    except Exception as exc:
        logger.exception("Failed to load volume %s", volume_id)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
