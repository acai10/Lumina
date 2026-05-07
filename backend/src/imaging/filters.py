import cv2
import numpy as np
from scipy.ndimage import uniform_filter

_VALID_FILTERS = {"gaussian", "median", "speckle_reduction"}


def apply_filter(array: np.ndarray, filter_type: str, params: dict) -> np.ndarray:
    if filter_type not in _VALID_FILTERS:
        raise ValueError(f"Unknown filter type: {filter_type!r}. Valid: {sorted(_VALID_FILTERS)}")

    if filter_type == "gaussian":
        ksize = _odd_kernel(int(params.get("kernel_size", 5)), min_val=1)
        sigma = float(params.get("sigma", 0))
        return cv2.GaussianBlur(array.astype(np.float32), (ksize, ksize), sigma)

    if filter_type == "median":
        ksize = _odd_kernel(int(params.get("kernel_size", 5)), min_val=1)
        return cv2.medianBlur(array.astype(np.float32), ksize)

    # speckle_reduction
    return _lee_filter(array, _positive_int(int(params.get("window_size", 7)), "window_size"))


def _odd_kernel(value: int, min_val: int = 1) -> int:
    if value < min_val:
        raise ValueError(f"kernel_size must be >= {min_val}, got {value}")
    return value if value % 2 == 1 else value + 1


def _positive_int(value: int, name: str) -> int:
    if value < 1:
        raise ValueError(f"{name} must be >= 1, got {value}")
    return value


def _lee_filter(array: np.ndarray, window: int) -> np.ndarray:
    arr = array.astype(np.float64)
    mean = uniform_filter(arr, size=window)
    mean_sq = uniform_filter(arr**2, size=window)
    variance = mean_sq - mean**2
    noise_var = float(np.mean(variance))
    w = variance / (variance + noise_var + 1e-8)
    return (mean + w * (arr - mean)).astype(np.float32)
