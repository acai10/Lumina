import numpy as np
import pytest

from src.processing.metrics import compute_all, compute_dice, compute_mse, compute_ncc


def _volume(seed: int = 0) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return rng.random((4, 8, 8)).astype(np.float32)


def test_ncc_identical_arrays() -> None:
    vol = _volume()
    assert compute_ncc(vol, vol) == pytest.approx(1.0, abs=1e-6)


def test_ncc_constant_array_returns_zero() -> None:
    a = np.ones((4, 8, 8), dtype=np.float32)
    b = _volume()
    assert compute_ncc(a, b) == pytest.approx(0.0, abs=1e-6)


def test_mse_identical_arrays() -> None:
    vol = _volume()
    assert compute_mse(vol, vol) == pytest.approx(0.0, abs=1e-9)


def test_mse_non_negative() -> None:
    a = _volume(0)
    b = _volume(1)
    assert compute_mse(a, b) >= 0.0


def test_dice_identical_masks() -> None:
    mask = (np.random.default_rng(0).random((4, 8, 8)) > 0.5).astype(np.uint8)
    assert compute_dice(mask, mask) == pytest.approx(1.0, abs=1e-9)


def test_dice_empty_masks_returns_one() -> None:
    empty = np.zeros((4, 8, 8), dtype=np.uint8)
    assert compute_dice(empty, empty) == pytest.approx(1.0)


def test_dice_disjoint_masks_returns_zero() -> None:
    a = np.zeros((4, 8, 8), dtype=np.uint8)
    b = np.zeros_like(a)
    a[0, 0, 0] = 1
    b[0, 0, 1] = 1
    assert compute_dice(a, b) == pytest.approx(0.0)


def test_compute_all_returns_required_keys() -> None:
    vol = _volume()
    metrics = compute_all(vol, vol)
    assert {"ncc", "mi", "mse"}.issubset(metrics.keys())


def test_compute_all_with_masks_includes_dice() -> None:
    vol = _volume()
    mask = (vol > 0.5).astype(np.uint8)
    metrics = compute_all(vol, vol, mask_a=mask, mask_b=mask)
    assert "dice" in metrics
