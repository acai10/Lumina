import numpy as np
import pytest

from src.processing.multi_volume import (
    compute_global_offsets,
    merge_volumes,
    overlap_crop,
    register_pair,
)


def _tile_with_blob(dy: int, dx: int, shape=(4, 40, 40)) -> np.ndarray:
    """A volume with a bright square whose top-left sits at (dy, dx)."""
    vol = np.zeros(shape, dtype=np.float32)
    vol[:, dy : dy + 8, dx : dx + 8] = 1.0
    return vol


def test_register_pair_recovers_known_shift():
    a = _tile_with_blob(10, 10)
    b = _tile_with_blob(16, 13)  # blob moved +6 in y, +3 in x
    dy, dx = register_pair(a, b)
    # register_pair returns the shift of b relative to a: b is shifted by (+6,+3),
    # so aligning b onto a needs (-6, -3).
    assert (round(dy), round(dx)) == (-6, -3)


def test_merge_volumes_places_tiles_by_offset():
    v0 = _tile_with_blob(0, 0, shape=(2, 10, 10))
    v1 = _tile_with_blob(0, 0, shape=(2, 10, 10))
    merged = merge_volumes([v0, v1], [(0.0, 0.0), (5.0, 5.0)])
    # Canvas grows by the offset span; both blobs survive via max-blending.
    assert merged.shape == (2, 15, 15)
    assert merged[:, 0:8, 0:8].min() == 1.0  # v0 blob at origin
    assert merged[:, 5:13, 5:13].min() == 1.0  # v1 blob shifted by (5, 5)


def test_merge_volumes_rejects_mismatched_shapes():
    v0 = np.zeros((2, 10, 10), dtype=np.float32)
    v1 = np.zeros((2, 10, 9), dtype=np.float32)
    with pytest.raises(ValueError, match="same shape|one shape"):
        merge_volumes([v0, v1], [(0.0, 0.0), (0.0, 0.0)])


def test_merge_volumes_empty_raises():
    with pytest.raises(ValueError, match="empty"):
        merge_volumes([], [])


def test_compute_global_offsets_accumulates_along_bfs():
    ids = ["a", "b", "c"]
    grid = {"a": (0, 0), "b": (0, 1), "c": (0, 2)}
    shifts = {("a", "b"): (1.0, 2.0), ("b", "c"): (0.0, 3.0)}
    offsets = compute_global_offsets(ids, grid, shifts)
    assert offsets["a"] == (0.0, 0.0)
    assert offsets["b"] == (1.0, 2.0)
    assert offsets["c"] == (1.0, 5.0)


def test_overlap_crop_returns_matching_regions():
    a = _tile_with_blob(0, 0)
    b = _tile_with_blob(0, 0)
    crops = overlap_crop(a, b, dy=5, dx=5)
    assert crops is not None
    crop_a, crop_b = crops
    assert crop_a.shape == crop_b.shape


def test_overlap_crop_none_when_disjoint():
    a = _tile_with_blob(0, 0, shape=(2, 10, 10))
    assert overlap_crop(a, a, dy=100, dx=0) is None
