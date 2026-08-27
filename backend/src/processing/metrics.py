"""Image similarity metrics used to score and compare stitching results.

:func:`compute_all` returns every metric at once for one pair of volumes, which is
what the job pipeline stores so different stitchers can be ranked side by side in
the UI. NCC and MI are similarity measures (higher is better), MSE and RMSE are
error measures (lower is better), and Dice compares the thresholded masks rather
than the intensities.
"""
import numpy as np
from skimage.metrics import normalized_mutual_information

_NCC_EPSILON = 1e-10


def compute_ncc(a: np.ndarray, b: np.ndarray) -> float:
    """Compute the Normalized Cross-Correlation between two arrays.

    Args:
        a: First input array (any shape; will be flattened).
        b: Second input array (same shape as *a*).

    Returns:
        NCC value in [-1, 1]; 0.0 when either array is constant.
    """
    a_flat = a.ravel().astype(np.float64)
    b_flat = b.ravel().astype(np.float64)
    a_norm = a_flat - a_flat.mean()
    b_norm = b_flat - b_flat.mean()
    denom = np.linalg.norm(a_norm) * np.linalg.norm(b_norm)
    if denom < _NCC_EPSILON:
        return 0.0
    return float(np.dot(a_norm, b_norm) / denom)


def compute_mi(a: np.ndarray, b: np.ndarray) -> float:
    """Compute Normalized Mutual Information between two arrays.

    Args:
        a: First input array.
        b: Second input array (same shape as *a*).

    Returns:
        NMI value (≥ 1.0; higher means more mutual information).
    """
    return float(normalized_mutual_information(a, b))


def compute_mse(a: np.ndarray, b: np.ndarray) -> float:
    """Compute Mean Squared Error between two arrays.

    Args:
        a: First input array.
        b: Second input array (same shape as *a*).

    Returns:
        MSE value (≥ 0.0; lower means more similar).
    """
    return float(np.mean((a.astype(np.float64) - b.astype(np.float64)) ** 2))


def compute_dice(mask_a: np.ndarray, mask_b: np.ndarray) -> float:
    """Compute Dice similarity coefficient between two binary masks.

    Args:
        mask_a: First binary mask (any numeric dtype; non-zero treated as True).
        mask_b: Second binary mask (same shape as *mask_a*).

    Returns:
        Dice score in [0, 1]; 1.0 when both masks are empty.
    """
    a = mask_a.astype(bool)
    b = mask_b.astype(bool)
    intersection = np.logical_and(a, b).sum()
    total = a.sum() + b.sum()
    if total == 0:
        return 1.0
    return float(2 * intersection / total)


def compute_rmse(a: np.ndarray, b: np.ndarray) -> float:
    """Compute Root Mean Squared Error between two arrays.

    Args:
        a: First input array.
        b: Second input array (same shape as *a*).

    Returns:
        RMSE value (≥ 0.0; lower means more similar).
    """
    return float(np.sqrt(np.mean((a.astype(np.float64) - b.astype(np.float64)) ** 2)))


def compute_all(
    a: np.ndarray,
    b: np.ndarray,
    mask_a: np.ndarray | None = None,
    mask_b: np.ndarray | None = None,
) -> dict[str, float]:
    """Compute all available quality metrics between *a* (reference) and *b* (result).

    Args:
        a: Reference volume (preprocessed input).
        b: Result volume (stitcher output).
        mask_a: Optional binary segmentation mask for *a* (enables Dice).
        mask_b: Optional binary segmentation mask for *b* (enables Dice).

    Returns:
        Dict with keys ``"ncc"``, ``"mi"``, ``"mse"``, ``"rmse"``, and optionally
        ``"dice"`` (when both masks are supplied).
    """
    result: dict[str, float] = {
        "ncc": compute_ncc(a, b),
        "mi": compute_mi(a, b),
        "mse": compute_mse(a, b),
        "rmse": compute_rmse(a, b),
    }
    if mask_a is not None and mask_b is not None:
        result["dice"] = compute_dice(mask_a, mask_b)
    return result
