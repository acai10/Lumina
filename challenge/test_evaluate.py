import h5py
import numpy as np
import pytest

from challenge_io import load_challenge_result
from evaluate import (
    _global_offsets,
    _otsu_threshold,
    _phase_corr,
    _stitch_2d,
    compute_mip,
    evaluate_all,
    evaluate_dataset,
    extract_surface_index,
    is_tissue_dataset,
    segment_from_mip,
)


def _write_tile(path, vol):
    """Write a (z, y, x) volume as a flat OCT tile with a vol_size attribute."""
    z, y, x = vol.shape
    with h5py.File(path, "w") as f:
        f.create_dataset("OCT", data=vol.reshape(1, -1).astype(np.float64))
        f.attrs["vol_size"] = np.asarray([x, y, z], dtype=np.float64)


# ── per-tile feature extraction ───────────────────────────────────────────────


def test_extract_surface_index_finds_brightest_depth():
    z, y, x = 10, 4, 5
    vol = np.zeros((z, y, x))
    vol[7] = 100.0  # brightest slice at depth 7 everywhere
    surf = extract_surface_index(vol)
    assert surf.shape == (y, x)
    assert np.all(surf == 7)


def test_compute_mip():
    vol = np.arange(2 * 3 * 4).reshape(2, 3, 4).astype(float)
    np.testing.assert_array_equal(compute_mip(vol), vol[1])


def test_segment_from_mip_is_binary():
    mip = np.array([[0.0, 0.0], [10.0, 10.0]])
    mask = segment_from_mip(mip)
    assert set(np.unique(mask).tolist()) <= {0.0, 1.0}
    assert mask.shape == mip.shape


def test_otsu_separates_two_clusters():
    vals = np.concatenate([np.zeros(100), np.full(100, 10.0)])
    thr = _otsu_threshold(vals)
    assert 0.0 < thr < 10.0


# ── stitching primitives ──────────────────────────────────────────────────────


def test_phase_corr_recovers_known_shift():
    rng = np.random.default_rng(0)
    base = rng.random((64, 64))
    shifted = np.roll(base, shift=(5, -3), axis=(0, 1))
    dy, dx = _phase_corr(base, shifted)
    assert (round(dy), round(dx)) == (-5, 3)  # mov shifted by (5,-3) -> ref-rel (-5,3)


def test_global_offsets_accumulate_along_grid():
    positions = [(1, 1), (1, 2), (2, 1)]
    shifts = {
        ((1, 1), (1, 2)): (0.0, 10.0),
        ((1, 1), (2, 1)): (8.0, 0.0),
    }
    off = _global_offsets(positions, shifts)
    assert off[(1, 1)] == (0.0, 0.0)
    assert off[(1, 2)] == (0.0, 10.0)
    assert off[(2, 1)] == (8.0, 0.0)


def test_stitch_2d_places_and_averages():
    tiles = {(1, 1): np.ones((4, 4)), (1, 2): np.full((4, 4), 3.0)}
    offsets = {(1, 1): (0, 0), (1, 2): (0, 4)}  # side by side, no overlap
    mosaic = _stitch_2d(tiles, offsets)
    assert mosaic.shape == (4, 8)
    assert mosaic[0, 0] == 1.0 and mosaic[0, 7] == 3.0


def test_stitch_2d_binary_rounds():
    tiles = {(1, 1): np.array([[0.0, 1.0]]), (1, 2): np.array([[1.0, 1.0]])}
    offsets = {(1, 1): (0, 0), (1, 2): (0, 1)}  # overlap on column 1
    mosaic = _stitch_2d(tiles, offsets, binary=True)
    assert set(np.unique(mosaic).tolist()) <= {0.0, 1.0}


# ── end-to-end on a tiny synthetic grid ───────────────────────────────────────


@pytest.fixture
def grid_2x2(tmp_path):
    """2x2 grid of tiny (8, 6, 6) volumes with a bright surface."""
    rng = np.random.default_rng(1)
    for r in (1, 2):
        for c in (1, 2):
            vol = rng.random((8, 6, 6)) * 5.0
            vol[3] += 50.0  # surface near depth 3
            _write_tile(tmp_path / f"Vol_{r}_{c}.h5", vol)
    return tmp_path


def test_evaluate_phantom_writes_valid_file(grid_2x2, tmp_path):
    out = evaluate_dataset(grid_2x2, tmp_path / "phantom.h5", dx=0.1, dy=0.08, dz=0.02)
    res = load_challenge_result(out)
    assert not res.has_mask
    assert res.surface.ndim == 2
    assert res.dx == pytest.approx(0.1)
    assert res.dy == pytest.approx(0.08)
    # surface near depth index 3 * dz = 0.06 mm
    assert res.surface.max() == pytest.approx(3 * 0.02)


def test_evaluate_tissue_writes_valid_mask(grid_2x2, tmp_path):
    out = evaluate_dataset(grid_2x2, tmp_path / "tissue.h5", with_mask=True)
    res = load_challenge_result(out)
    assert res.has_mask
    assert set(np.unique(res.mask).tolist()) <= {0.0, 1.0}
    assert res.mask.shape == res.surface.shape


def test_evaluate_empty_folder_raises(tmp_path):
    with pytest.raises(ValueError, match="No Vol_"):
        evaluate_dataset(tmp_path, tmp_path / "x.h5")


# ── tissue detection + evaluate_all ───────────────────────────────────────────


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("5_DataSet_3", True),
        ("5_dataset_3", True),
        ("5_DataSet_1", False),
        ("5_DataSet_2", False),
    ],
)
def test_is_tissue_dataset(name, expected):
    assert is_tissue_dataset(name) is expected


def test_evaluate_all_masks_only_dataset_3(tmp_path):
    root = tmp_path / "Challenge_Dataset"
    rng = np.random.default_rng(2)
    for ds in ("5_DataSet_1", "5_DataSet_3"):
        folder = root / ds
        folder.mkdir(parents=True)
        for r in (1, 2):
            for c in (1, 2):
                vol = rng.random((8, 6, 6)) * 5.0
                vol[3] += 50.0
                _write_tile(folder / f"Vol_{r}_{c}.h5", vol)

    results = evaluate_all(tmp_path, tmp_path / "out")
    assert set(results) == {"5_DataSet_1", "5_DataSet_3"}
    assert not load_challenge_result(results["5_DataSet_1"]).has_mask
    assert load_challenge_result(results["5_DataSet_3"]).has_mask
