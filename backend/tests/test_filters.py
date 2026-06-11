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
