import logging
from typing import Any

import numpy as np
import scipy.ndimage as ndi

logger = logging.getLogger(__name__)


def apply_gaussian(volume: np.ndarray, params: dict) -> np.ndarray:
    """Apply per-slice Gaussian blur.

    Args:
        volume: Float32 array of shape (n_slices, height, width).
        params: Accepts ``sigma`` (float, default 1.0).

    Returns:
        Blurred volume of the same shape and dtype.
    """
    sigma = float(params.get("sigma", 1.0))
    out = np.empty_like(volume)
    for i in range(volume.shape[0]):
        out[i] = ndi.gaussian_filter(volume[i], sigma=sigma)
    return out


def apply_median(volume: np.ndarray, params: dict) -> np.ndarray:
    """Apply per-slice median filter.

    Args:
        volume: Float32 array of shape (n_slices, height, width).
        params: Accepts ``size`` (int, default 3).

    Returns:
        Filtered volume of the same shape and dtype.
    """
    size = int(params.get("size", 3))
    out = np.empty_like(volume)
    for i in range(volume.shape[0]):
        out[i] = ndi.median_filter(volume[i], size=size)
    return out


def apply_mean(volume: np.ndarray, params: dict) -> np.ndarray:
    """Apply per-slice uniform (mean) filter.

    Args:
        volume: Float32 array of shape (n_slices, height, width).
        params: Accepts ``size`` (int, default 3).

    Returns:
        Filtered volume of the same shape and dtype.
    """
    size = int(params.get("size", 3))
    out = np.empty_like(volume)
    for i in range(volume.shape[0]):
        out[i] = ndi.uniform_filter(volume[i], size=size)
    return out


def apply_normalize(volume: np.ndarray, params: dict) -> np.ndarray:
    """Percentile-based intensity normalization to [0, 1].

    Args:
        volume: Float32 array of any shape.
        params: Accepts ``low_percentile`` (float, default 1.0) and
            ``high_percentile`` (float, default 99.0).

    Returns:
        Clipped and normalized float32 array of the same shape.
    """
    low_pct = float(params.get("low_percentile", 1.0))
    high_pct = float(params.get("high_percentile", 99.0))
    lo = float(np.percentile(volume, low_pct))
    hi = float(np.percentile(volume, high_pct))
    if hi > lo:
        return np.clip((volume - lo) / (hi - lo), 0.0, 1.0).astype(np.float32)
    return np.zeros_like(volume)


def apply_edge_highlight(volume: np.ndarray, params: dict) -> np.ndarray:
    """Per-slice Sobel edge magnitude, normalised to [0, 1].

    Computes the gradient magnitude using Sobel operators along both in-plane
    axes and clips the result to the original intensity range so that edge maps
    can be stacked in a pipeline alongside other filters.

    Args:
        volume: Float32 array of shape (n_slices, height, width).
        params: No parameters required (reserved for future use).

    Returns:
        Edge-magnitude volume of the same shape and dtype, values in [0, 1].
    """
    out = np.empty_like(volume)
    for i in range(volume.shape[0]):
        sx = ndi.sobel(volume[i], axis=0)
        sy = ndi.sobel(volume[i], axis=1)
        mag = np.hypot(sx, sy)
        max_val = float(mag.max())
        out[i] = (mag / max_val).astype(np.float32) if max_val > 0 else mag.astype(np.float32)
    return out


_FILTER_REGISTRY = {
    "gaussian": apply_gaussian,
    "median": apply_median,
    "mean": apply_mean,
    "normalize": apply_normalize,
    "edge": apply_edge_highlight,
}


def apply_filter_chain(
    volume: np.ndarray,
    chain: list[dict[str, Any]],
    *,
    copy_input: bool = True,
) -> np.ndarray:
    """Apply a sequence of named filters to *volume* in order.

    Args:
        volume: Input float32 volume array.
        chain: Ordered list of ``{"type": str, "params": dict}`` dicts.
        copy_input: When *True* (default) the input is copied before the first
            filter so the original array is never modified.  Pass *False* when
            the caller owns a temporary array and wants to skip the 1 GB copy —
            e.g. when *volume* was just loaded from disk for this call only.

    Returns:
        Filtered volume (same shape unless a future filter changes it).

    Raises:
        ValueError: If any step references an unknown filter type.
    """
    result = volume.copy() if copy_input else volume
    for step in chain:
        filter_type = step.get("type", "")
        fn = _FILTER_REGISTRY.get(filter_type)
        if fn is None:
            raise ValueError(f"Unknown filter type: {filter_type!r}")
        logger.debug("Applying filter '%s' with params %s", filter_type, step.get("params", {}))
        result = fn(result, step.get("params", {}))
    return result
