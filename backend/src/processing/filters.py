import logging
from typing import Any

import numpy as np
import scipy.ndimage as ndi

logger = logging.getLogger(__name__)

_LEE_EPSILON = 1e-10


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


def apply_lee(volume: np.ndarray, params: dict) -> np.ndarray:
    """Lee speckle filter — variance-based per slice.

    Args:
        volume: Float32 array of shape (n_slices, height, width).
        params: Accepts ``window`` (int, default 7).

    Returns:
        Speckle-filtered volume of the same shape and dtype.
    """
    window = int(params.get("window", 7))
    out = np.empty_like(volume)
    for i in range(volume.shape[0]):
        s = volume[i].astype(np.float32)
        local_mean = ndi.uniform_filter(s, size=window)
        local_sq_mean = ndi.uniform_filter(s**2, size=window)
        local_var = local_sq_mean - local_mean**2
        noise_var = float(np.mean(local_var))
        weight = local_var / (local_var + noise_var + _LEE_EPSILON)
        out[i] = local_mean + weight * (s - local_mean)
    return out


def apply_bm3d(volume: np.ndarray, params: dict) -> np.ndarray:
    """Apply BM3D denoising per slice.

    Requires the optional ``bm3d`` package (``uv sync --extra bm3d``).

    Args:
        volume: Float32 array of shape (n_slices, height, width).
        params: Accepts ``sigma_psd`` (float, default 0.1).

    Returns:
        Denoised volume of the same shape and dtype.

    Raises:
        RuntimeError: If ``bm3d`` is not installed on this platform.
    """
    try:
        import bm3d
    except (ImportError, OSError) as exc:
        raise RuntimeError(
            "bm3d is not installed or unavailable on this platform. "
            "Install with: uv sync --extra bm3d"
        ) from exc

    sigma_psd = float(params.get("sigma_psd", 0.1))
    out = np.empty_like(volume)
    for i in range(volume.shape[0]):
        out[i] = bm3d.bm3d(volume[i].astype(np.float32), sigma_psd=sigma_psd)
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


def apply_anisotropy_correction(volume: np.ndarray, params: dict) -> np.ndarray:
    """Resample the volume along each axis to correct voxel anisotropy.

    Args:
        volume: Float32 array of shape (n_slices, height, width).
        params: Accepts ``zoom_factors`` (list[float], default [1.0, 1.0, 1.0]).

    Returns:
        Resampled float32 array; shape depends on zoom_factors.
    """
    zoom_factors = params.get("zoom_factors", [1.0, 1.0, 1.0])
    return ndi.zoom(volume, zoom=zoom_factors, order=1).astype(np.float32)


_FILTER_REGISTRY = {
    "gaussian": apply_gaussian,
    "median": apply_median,
    "lee": apply_lee,
    "bm3d": apply_bm3d,
    "normalize": apply_normalize,
    "anisotropy": apply_anisotropy_correction,
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
        Filtered volume (may differ in shape if anisotropy zoom is applied).

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
