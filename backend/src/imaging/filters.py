import cv2
import numpy as np
from scipy.ndimage import uniform_filter


def apply_filter(array: np.ndarray, filter_type: str, params: dict) -> np.ndarray:
    if filter_type == "gaussian":
        ksize = int(params.get("kernel_size", 5))
        if ksize % 2 == 0:
            ksize += 1
        sigma = float(params.get("sigma", 0))
        return cv2.GaussianBlur(array.astype(np.float32), (ksize, ksize), sigma)

    if filter_type == "median":
        ksize = int(params.get("kernel_size", 5))
        if ksize % 2 == 0:
            ksize += 1
        return cv2.medianBlur(array.astype(np.float32), ksize)

    if filter_type == "speckle_reduction":
        return _lee_filter(array, int(params.get("window_size", 7)))

    raise ValueError(f"Unknown filter type: {filter_type!r}")


def _lee_filter(array: np.ndarray, window: int) -> np.ndarray:
    arr = array.astype(np.float64)
    mean = uniform_filter(arr, size=window)
    mean_sq = uniform_filter(arr**2, size=window)
    variance = mean_sq - mean**2
    noise_var = float(np.mean(variance))
    w = variance / (variance + noise_var + 1e-8)
    return (mean + w * (arr - mean)).astype(np.float32)
