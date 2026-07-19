import numpy as np
import pytest

from src.processing.filters import apply_filter_chain

# Small synthetic volume to keep tests fast
_SHAPE = (4, 8, 8)


@pytest.fixture
def volume() -> np.ndarray:
    rng = np.random.default_rng(0)
    return rng.random(_SHAPE).astype(np.float32)


def test_empty_chain_returns_copy(volume: np.ndarray) -> None:
    result = apply_filter_chain(volume, [])
    np.testing.assert_array_equal(result, volume)
    assert result is not volume


def test_gaussian_preserves_shape(volume: np.ndarray) -> None:
    result = apply_filter_chain(volume, [{"type": "gaussian", "params": {"sigma": 1.0}}])
    assert result.shape == volume.shape
    assert result.dtype == np.float32


def test_median_preserves_shape(volume: np.ndarray) -> None:
    result = apply_filter_chain(volume, [{"type": "median", "params": {"size": 3}}])
    assert result.shape == volume.shape


def test_mean_preserves_shape(volume: np.ndarray) -> None:
    result = apply_filter_chain(volume, [{"type": "mean", "params": {"size": 3}}])
    assert result.shape == volume.shape
    assert result.dtype == np.float32


def test_normalize_clamps_to_unit_range(volume: np.ndarray) -> None:
    result = apply_filter_chain(volume, [{"type": "normalize", "params": {}}])
    assert float(result.min()) >= 0.0
    assert float(result.max()) <= 1.0


def test_edge_highlight_range(volume: np.ndarray) -> None:
    result = apply_filter_chain(volume, [{"type": "edge", "params": {}}])
    assert result.shape == volume.shape
    assert float(result.min()) >= 0.0
    assert float(result.max()) <= 1.0 + 1e-5


def test_edge_highlight_robust_to_outlier() -> None:
    # On a realistically sized volume, a single hot pixel sits far inside the
    # percentile tail, so it must not crush the dynamic range of the real edges.
    rng = np.random.default_rng(1)
    base = rng.random((4, 64, 64)).astype(np.float32)
    spiked = base.copy()
    spiked[0, 32, 32] = 1e6
    result = apply_filter_chain(spiked, [{"type": "edge", "params": {}}])
    assert float(result.max()) <= 1.0 + 1e-5
    # Edges in other slices stay clearly visible despite the outlier; max-based
    # normalization would have collapsed them toward zero.
    assert float(result[1:].max()) > 0.1


def test_edge_highlight_stays_in_unit_range_for_sparse_bright_region() -> None:
    # Degenerate input: <1% bright voxels → the 99th-percentile magnitude is 0.
    # The filter must fall back to max-normalisation instead of returning raw
    # (unbounded) gradient magnitudes.
    vol = np.zeros((2, 64, 64), dtype=np.float32)
    vol[0, 30:34, 30:34] = 100.0
    result = apply_filter_chain(vol, [{"type": "edge", "params": {}}])
    assert float(result.max()) <= 1.0 + 1e-5
    assert float(result.max()) > 0.0  # edges are still visible, not zeroed


def test_edge_highlight_sigma_zero_disables_smoothing(volume: np.ndarray) -> None:
    smoothed = apply_filter_chain(volume, [{"type": "edge", "params": {"sigma": 2.0}}])
    raw = apply_filter_chain(volume, [{"type": "edge", "params": {"sigma": 0}}])
    assert smoothed.shape == raw.shape == volume.shape
    # Smoothing should change the result (fewer high-frequency edges).
    assert not np.allclose(smoothed, raw)


def test_chained_filters_preserve_shape(volume: np.ndarray) -> None:
    chain = [
        {"type": "gaussian", "params": {"sigma": 0.5}},
        {"type": "normalize", "params": {}},
    ]
    result = apply_filter_chain(volume, chain)
    assert result.shape == volume.shape


def test_unknown_filter_raises_value_error(volume: np.ndarray) -> None:
    with pytest.raises(ValueError, match="Unknown filter type"):
        apply_filter_chain(volume, [{"type": "nonexistent", "params": {}}])
