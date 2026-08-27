"""Preprocessing filter chain applied to a volume before analysis.

Each ``apply_*`` function takes a volume plus a ``params`` dict and returns a new
volume of the same shape, so the filters compose: :func:`apply_filter_chain` runs
them in the order the caller lists them. The registry at the bottom of the module
maps the names used by the API (``"gaussian"``, ``"median"``, ``"mean"``,
``"normalize"``, ``"edge"``, ``"segment"``) onto these functions.

Filters are deliberately per-slice where that is the meaningful unit (blur, median,
mean, edges) and whole-volume where it is not (percentile normalisation), because
OCT slices differ strongly in overall brightness with depth.
"""
import logging
from typing import Any

import numpy as np
import scipy.ndimage as ndi

from .submission import segment_muscle_fat

logger = logging.getLogger(__name__)


def apply_gaussian(volume: np.ndarray, params: dict[str, Any]) -> np.ndarray:
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


def apply_median(volume: np.ndarray, params: dict[str, Any]) -> np.ndarray:
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


def apply_mean(volume: np.ndarray, params: dict[str, Any]) -> np.ndarray:
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


def apply_normalize(volume: np.ndarray, params: dict[str, Any]) -> np.ndarray:
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
        # float32 input already yields float32 here; asarray casts only if needed
        # instead of astype's unconditional full copy.
        return np.asarray(np.clip((volume - lo) / (hi - lo), 0.0, 1.0), dtype=np.float32)
    return np.zeros_like(volume)


def apply_edge_highlight(volume: np.ndarray, params: dict[str, Any]) -> np.ndarray:
    """Per-slice Sobel edge magnitude, normalised to [0, 1].

    Each slice is optionally Gaussian-smoothed first (so the derivative is not
    dominated by speckle noise), then the in-plane gradient magnitude is computed
    with Sobel operators. The whole volume is normalised together against a high
    percentile rather than the absolute maximum, so a single bright outlier pixel
    no longer washes out the real edges and contrast stays consistent between
    slices. Output stays in [0, 1] so edge maps can be stacked in a pipeline.

    Args:
        volume: Float32 array of shape (n_slices, height, width).
        params: Accepts ``sigma`` (float, default 1.0) for pre-smoothing — set to
            0 to disable — and ``high_percentile`` (float, default 99.0) for the
            normalization reference.

    Returns:
        Edge-magnitude volume of the same shape and dtype, values in [0, 1].
    """
    sigma = float(params.get("sigma", 1.0))
    high_pct = float(params.get("high_percentile", 99.0))

    out = np.empty_like(volume)
    for i in range(volume.shape[0]):
        plane = ndi.gaussian_filter(volume[i], sigma=sigma) if sigma > 0 else volume[i]
        sx = ndi.sobel(plane, axis=0)
        sy = ndi.sobel(plane, axis=1)
        out[i] = np.hypot(sx, sy)

    # Normalise the whole volume together for consistent slice-to-slice contrast,
    # using a high percentile so outlier pixels do not crush the dynamic range.
    ref = float(np.percentile(out, high_pct))
    if ref <= 0:
        # Degenerate input (e.g. a tiny bright region in an otherwise empty
        # volume): the percentile is 0 although edges exist. Fall back to the
        # absolute maximum so the documented [0, 1] output range always holds.
        ref = float(out.max())
    if ref > 0:
        np.clip(out / ref, 0.0, 1.0, out=out)
    return out


def apply_segment(volume: np.ndarray, params: dict[str, Any]) -> np.ndarray:
    """Muscle/fat segmentation applied to the volume (fat/background zeroed).

    Computes the binary muscle/fat mask from the volume's maximum-intensity
    projection (Otsu split — see :func:`segment_muscle_fat`) and multiplies it
    into every slice:

        out[z, y, x] = vol[z, y, x] * mask[y, x]

    Muscle columns keep their original intensities, fat/background columns
    become 0 — so the segmentation is directly visible in both the 3D point
    cloud and the slice viewer, and behaves like any other pipeline filter
    (chainable, compare, revert).

    Args:
        volume: Float32 array of shape (n_slices, height, width).
        params: No parameters — the Otsu threshold is derived automatically.

    Returns:
        Masked volume of the same shape and dtype.
    """
    del params  # no tunables — Otsu picks the split automatically
    mask = segment_muscle_fat(volume).astype(np.float32)  # (height, width), {0, 1}
    return (volume * mask[np.newaxis, :, :]).astype(np.float32)


_FILTER_REGISTRY = {
    "gaussian": apply_gaussian,
    "median": apply_median,
    "mean": apply_mean,
    "normalize": apply_normalize,
    "edge": apply_edge_highlight,
    "segment": apply_segment,
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
            the caller owns a temporary array and wants to skip the full-volume
            copy (~128 MB per standard tile, ~1 GB for a large merge) — e.g.
            when *volume* was just loaded from disk for this call only.

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
