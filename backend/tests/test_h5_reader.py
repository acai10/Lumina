"""Unit tests for h5_reader: validation and reshape guards at the upload boundary."""

import h5py
import numpy as np
import pytest

from src.processing import h5_reader
from src.processing.h5_reader import (
    OCT_DIMS,
    load_volume,
    load_volume_flexible,
    save_oct_volume,
    validate_volume_file,
)


def _lazy_h5(path, shape, name: str = "OCT") -> None:
    """Create a dataset of *shape* without storing data (chunked, compressed)."""
    with h5py.File(path, "w") as f:
        f.create_dataset(name, shape=shape, dtype="f4", chunks=True, compression="gzip")


# ── validate_volume_file ──────────────────────────────────────────────────────


def test_validate_accepts_exact_oct_dims(tmp_path) -> None:
    p = tmp_path / "ok.h5"
    _lazy_h5(p, OCT_DIMS)
    validate_volume_file(p)  # must not raise


def test_validate_accepts_flat_layout_with_right_count(tmp_path) -> None:
    p = tmp_path / "flat.h5"
    _lazy_h5(p, (OCT_DIMS[0] * OCT_DIMS[1] * OCT_DIMS[2],))
    validate_volume_file(p)  # must not raise


def test_validate_rejects_transposed_3d(tmp_path) -> None:
    # Same element count, different axis order: a blind reshape would scramble
    # the axes, so this must be rejected.
    p = tmp_path / "transposed.h5"
    _lazy_h5(p, (250, 250, 512))
    with pytest.raises(ValueError, match="Expected"):
        validate_volume_file(p)


def test_validate_rejects_wrong_shape(tmp_path) -> None:
    p = tmp_path / "small.h5"
    _lazy_h5(p, (2, 3, 4))
    with pytest.raises(ValueError):
        validate_volume_file(p)


def test_validate_rejects_missing_dataset(tmp_path) -> None:
    p = tmp_path / "nods.h5"
    _lazy_h5(p, (2, 2), name="other")
    with pytest.raises(ValueError, match="OCT"):
        validate_volume_file(p)


def test_validate_raises_oserror_for_non_hdf5(tmp_path) -> None:
    p = tmp_path / "garbage.h5"
    p.write_bytes(b"definitely not hdf5")
    with pytest.raises(OSError):
        validate_volume_file(p)


# ── load_volume / load_volume_flexible ────────────────────────────────────────


def test_load_volume_reshapes_flat_layout(tmp_path, monkeypatch) -> None:
    dims = (4, 2, 3)
    monkeypatch.setattr(h5_reader, "OCT_DIMS", dims)
    p = tmp_path / "flat.h5"
    data = np.arange(np.prod(dims), dtype=np.float32)
    with h5py.File(p, "w") as f:
        f.create_dataset("OCT", data=data)
    vol = load_volume(p)
    assert vol.shape == dims
    np.testing.assert_array_equal(vol.ravel(), data)


def test_load_volume_rejects_wrong_count(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(h5_reader, "OCT_DIMS", (4, 2, 3))
    p = tmp_path / "short.h5"
    with h5py.File(p, "w") as f:
        f.create_dataset("OCT", data=np.zeros(5, dtype=np.float32))
    with pytest.raises(ValueError):
        load_volume(p)


def test_load_flexible_accepts_any_3d_shape(tmp_path) -> None:
    p = tmp_path / "crop.h5"
    save_oct_volume(p, np.zeros((2, 3, 4), dtype=np.float32))
    assert load_volume_flexible(p).shape == (2, 3, 4)


def test_load_flexible_rejects_4d_even_with_matching_count(tmp_path, monkeypatch) -> None:
    # ndim > 2 may not be blindly reshaped — the axis order would be undefined.
    dims = (4, 2, 3)
    monkeypatch.setattr(h5_reader, "OCT_DIMS", dims)
    p = tmp_path / "fourd.h5"
    with h5py.File(p, "w") as f:
        f.create_dataset("OCT", data=np.zeros((4, 2, 3, 1), dtype=np.float32))
    with pytest.raises(ValueError, match="cannot be interpreted"):
        load_volume_flexible(p)


def test_save_load_roundtrip_preserves_values(tmp_path) -> None:
    p = tmp_path / "roundtrip.h5"
    vol = np.random.default_rng(0).random((3, 4, 5)).astype(np.float32)
    save_oct_volume(p, vol)
    np.testing.assert_array_equal(load_volume_flexible(p), vol)
