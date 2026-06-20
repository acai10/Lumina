import h5py
import numpy as np
import pytest

from challenge_data import (
    DEFAULT_SHAPE,
    dataset_grid,
    list_datasets,
    load_input_volume,
    parse_grid_position,
)

# Path to the (optional, git-ignored) real challenge data.
_REAL_DATA = "data/Challenge_Dataset"


def _write_flat_oct(path, shape, vol_size=None):
    """Write a synthetic flat OCT tile (small, so tests stay fast)."""
    z, y, x = shape
    data = np.arange(z * y * x, dtype=np.float64)
    with h5py.File(path, "w") as f:
        f.create_dataset("OCT", data=data.reshape(1, -1))
        if vol_size is not None:
            f.attrs["vol_size"] = np.asarray(vol_size, dtype=np.float64)


# ── grid parsing ──────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("Vol_1_1.h5", (1, 1)),
        ("Vol_2_5.h5", (2, 5)),
        ("/abs/path/Vol_5_3.h5", (5, 3)),
        ("Vol_10_12.h5", (10, 12)),
    ],
)
def test_parse_grid_position(name, expected):
    assert parse_grid_position(name) == expected


def test_parse_grid_position_invalid():
    with pytest.raises(ValueError, match="Cannot parse"):
        parse_grid_position("random.h5")


# ── volume loading + reshape order ────────────────────────────────────────────


def test_load_reshapes_reverse_of_vol_size(tmp_path):
    # vol_size = [x, y, z] -> array shape (z, y, x)
    p = tmp_path / "Vol_1_1.h5"
    _write_flat_oct(p, shape=(4, 3, 2), vol_size=[2, 3, 4])
    vol = load_input_volume(p)
    assert vol.shape == (4, 3, 2)
    assert vol.dtype == np.float64
    # C-order reshape preserves the flat ordering
    np.testing.assert_array_equal(vol.ravel(), np.arange(24))


def test_load_falls_back_to_default_shape(tmp_path):
    p = tmp_path / "Vol_2_2.h5"
    z, y, x = DEFAULT_SHAPE
    # no vol_size attribute -> must assume DEFAULT_SHAPE; use a matching element count
    data = np.zeros((1, z * y * x), dtype=np.float64)
    with h5py.File(p, "w") as f:
        f.create_dataset("OCT", data=data)
    vol = load_input_volume(p)
    assert vol.shape == DEFAULT_SHAPE


def test_load_rejects_size_mismatch(tmp_path):
    p = tmp_path / "Vol_1_1.h5"
    # vol_size claims 2*3*4=24 but we store 10 elements
    with h5py.File(p, "w") as f:
        f.create_dataset("OCT", data=np.zeros((1, 10)))
        f.attrs["vol_size"] = np.asarray([2, 3, 4], dtype=np.float64)
    with pytest.raises(ValueError, match="does not match"):
        load_input_volume(p)


def test_load_missing_oct_dataset(tmp_path):
    p = tmp_path / "Vol_1_1.h5"
    with h5py.File(p, "w") as f:
        f.create_dataset("not_oct", data=np.zeros((1, 24)))
    with pytest.raises(ValueError, match="Missing 'OCT'"):
        load_input_volume(p)


# ── grid + dataset discovery ──────────────────────────────────────────────────


def test_dataset_grid(tmp_path):
    for r in (1, 2):
        for c in (1, 2):
            _write_flat_oct(tmp_path / f"Vol_{r}_{c}.h5", (2, 2, 2), vol_size=[2, 2, 2])
    grid = dataset_grid(tmp_path)
    assert set(grid) == {(1, 1), (1, 2), (2, 1), (2, 2)}
    assert all(p.exists() for p in grid.values())


def test_dataset_grid_missing_folder(tmp_path):
    with pytest.raises(FileNotFoundError):
        dataset_grid(tmp_path / "nope")


def test_list_datasets(tmp_path):
    base = tmp_path / "Challenge_Dataset"
    (base / "5_DataSet_1").mkdir(parents=True)
    (base / "5_DataSet_2").mkdir(parents=True)
    (base / "empty").mkdir(parents=True)  # no Vol_* -> excluded
    _write_flat_oct(base / "5_DataSet_1" / "Vol_1_1.h5", (2, 2, 2), vol_size=[2, 2, 2])
    _write_flat_oct(base / "5_DataSet_2" / "Vol_1_1.h5", (2, 2, 2), vol_size=[2, 2, 2])
    found = list_datasets(tmp_path)  # parent of Challenge_Dataset
    assert set(found) == {"5_DataSet_1", "5_DataSet_2"}


# ── optional sanity check against the real data (skips if not present) ─────────


@pytest.mark.skipif(
    not (__import__("pathlib").Path(_REAL_DATA).is_dir()),
    reason="real challenge data not present (git-ignored)",
)
def test_real_data_loads_with_expected_shape():
    datasets = list_datasets("data")
    assert datasets, "expected at least one dataset folder"
    name, folder = next(iter(datasets.items()))
    grid = dataset_grid(folder)
    assert len(grid) == 25, f"{name} should be a 5x5 grid, got {len(grid)} tiles"
    vol = load_input_volume(grid[(1, 1)])
    assert vol.shape == (512, 250, 250)
    assert vol.dtype == np.float64
