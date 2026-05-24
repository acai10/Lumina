import numpy as np
from skimage.metrics import normalized_mutual_information

_NCC_EPSILON = 1e-10


def compute_ncc(a: np.ndarray, b: np.ndarray) -> float:
    a_flat = a.ravel().astype(np.float64)
    b_flat = b.ravel().astype(np.float64)
    a_norm = a_flat - a_flat.mean()
    b_norm = b_flat - b_flat.mean()
    denom = np.linalg.norm(a_norm) * np.linalg.norm(b_norm)
    if denom < _NCC_EPSILON:
        return 0.0
    return float(np.dot(a_norm, b_norm) / denom)


def compute_mi(a: np.ndarray, b: np.ndarray) -> float:
    return float(normalized_mutual_information(a, b))


def compute_mse(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.mean((a.astype(np.float64) - b.astype(np.float64)) ** 2))


def compute_dice(mask_a: np.ndarray, mask_b: np.ndarray) -> float:
    a = mask_a.astype(bool)
    b = mask_b.astype(bool)
    intersection = np.logical_and(a, b).sum()
    total = a.sum() + b.sum()
    if total == 0:
        return 1.0
    return float(2 * intersection / total)


def compute_all(
    a: np.ndarray,
    b: np.ndarray,
    mask_a: np.ndarray | None = None,
    mask_b: np.ndarray | None = None,
) -> dict[str, float]:
    result: dict[str, float] = {
        "ncc": compute_ncc(a, b),
        "mi": compute_mi(a, b),
        "mse": compute_mse(a, b),
    }
    if mask_a is not None and mask_b is not None:
        result["dice"] = compute_dice(mask_a, mask_b)
    return result
