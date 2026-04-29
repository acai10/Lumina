from typing import Tuple

import cv2
import numpy as np


def segment(array: np.ndarray, method: str) -> Tuple[np.ndarray, np.ndarray]:
    arr8 = _to_uint8(array)
    if method == "threshold":
        return _threshold_segment(arr8)
    if method == "graph_cut":
        return _graph_cut_segment(arr8)
    raise ValueError(f"Unknown segmentation method: {method!r}")


def _to_uint8(array: np.ndarray) -> np.ndarray:
    arr = array.astype(np.float32)
    mn, mx = float(arr.min()), float(arr.max())
    if mx > mn:
        arr = (arr - mn) / (mx - mn) * 255.0
    return arr.clip(0, 255).astype(np.uint8)


def _threshold_segment(arr8: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    _, mask = cv2.threshold(arr8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    result = cv2.bitwise_and(arr8, arr8, mask=mask)
    return result, mask


def _graph_cut_segment(arr8: np.ndarray) -> Tuple[np.ndarray, np.ndarray]:
    # Approximate graph-cut via skimage random_walker; falls back to threshold
    try:
        from skimage.segmentation import random_walker

        labels = np.zeros(arr8.shape, dtype=np.int32)
        labels[arr8 < 50] = 1
        labels[arr8 > 200] = 2
        result_labels = random_walker(arr8.astype(np.float64), labels, beta=10, mode="bf")
        mask = ((result_labels == 2) * 255).astype(np.uint8)
        result = cv2.bitwise_and(arr8, arr8, mask=mask)
        return result, mask
    except Exception:
        return _threshold_segment(arr8)
