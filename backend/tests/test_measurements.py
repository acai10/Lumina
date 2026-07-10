import numpy as np

from src.processing.measurements import compute_measurements


def _solid_block() -> np.ndarray:
    """A 4×4×4 solid cube of above-threshold intensity inside an 8³ empty volume."""
    vol = np.zeros((8, 8, 8), dtype=np.float32)
    vol[2:6, 2:6, 2:6] = 1.0
    return vol


def test_volume_counts_voxels_times_spacing():
    res = compute_measurements(_solid_block(), threshold=0.5, voxel_size_um=(2.0, 3.0, 4.0))
    # 4³ = 64 voxels, each 2·3·4 = 24 µm³
    assert res["voxel_count"] == 64
    assert res["volume_um3"] == 64 * 24.0


def test_surface_area_is_not_double_counted():
    # A solid 4×4×4 cube has 6 faces of 4×4 = 16 voxel-faces each = 96 unit faces.
    # With isotropic 1 µm spacing each face is 1 µm², so the area must be 96 µm² —
    # the old shell-diff implementation returned ~2× this.
    res = compute_measurements(_solid_block(), threshold=0.5, voxel_size_um=(1.0, 1.0, 1.0))
    assert res["surface_area_um2"] == 96.0


def test_thickness_uses_axial_spacing():
    res = compute_measurements(_solid_block(), threshold=0.5, voxel_size_um=(5.0, 1.0, 1.0))
    # The cube is 4 voxels deep along z → 4 · 5 µm = 20 µm everywhere it exists.
    assert res["max_thickness_um"] == 20.0
    assert res["mean_thickness_um"] == 20.0


def test_lateral_diameter_is_widest_extent():
    res = compute_measurements(_solid_block(), threshold=0.5, voxel_size_um=(1.0, 2.0, 3.0))
    # 4 voxels wide in x (·3 = 12) and 4 in y (·2 = 8) → max is 12.
    assert res["lateral_diameter_um"] == 12.0


def test_empty_volume_returns_zeros():
    res = compute_measurements(np.zeros((4, 4, 4), dtype=np.float32), threshold=0.5)
    assert res["voxel_count"] == 0
    assert res["volume_um3"] == 0.0
    assert res["surface_area_um2"] == 0.0
    assert res["mean_thickness_um"] == 0.0
