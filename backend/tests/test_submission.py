import io

import h5py
import numpy as np
import pytest
from PIL import Image

from src.processing.submission import (
    build_submission,
    describe_submission,
    extract_surface,
    segment_muscle_fat,
    write_submission,
)


@pytest.fixture
def volume() -> np.ndarray:
    """Small (z, y, x) volume with a bright surface near depth 3."""
    rng = np.random.default_rng(0)
    vol = (rng.random((10, 8, 6)) * 5.0).astype(np.float32)
    vol[3] += 50.0
    return vol


def test_extract_surface_depth_and_scaling(volume):
    surf = extract_surface(volume, dz=0.004)
    assert surf.shape == (8, 6)
    assert surf.dtype == np.float64
    # brightest slice is index 3 -> depth 3 * 0.004 mm
    assert np.allclose(surf, 3 * 0.004)


def test_extract_surface_rejects_2d():
    with pytest.raises(ValueError, match="3D"):
        extract_surface(np.zeros((4, 4)))


def test_segment_muscle_fat_is_binary(volume):
    mask = segment_muscle_fat(volume)
    assert mask.shape == (8, 6)
    assert set(np.unique(mask).tolist()) <= {0.0, 1.0}


def test_segment_flat_volume_returns_zeros():
    assert segment_muscle_fat(np.ones((4, 4, 4))).sum() == 0.0


def test_write_submission_format(tmp_path, volume):
    surf = extract_surface(volume)
    mask = segment_muscle_fat(volume)
    path = write_submission(tmp_path / "s.h5", surf, 0.004, 0.008, mask=mask)
    with h5py.File(path, "r") as f:
        assert f["surface"].dtype == np.float64
        assert f["mask"].dtype == np.float64
        # dx/dy are stored as 1-element float64 arrays (shape (1,)) to match the
        # reference SubmissionExample.h5 produced by MATLAB's h5writeatt.
        assert f["surface"].attrs["dx"].shape == (1,)
        assert f["surface"].attrs["dy"].shape == (1,)
        assert float(f["surface"].attrs["dx"][0]) == pytest.approx(0.004)
        assert float(f["surface"].attrs["dy"][0]) == pytest.approx(0.008)


def test_write_submission_phantom_has_no_mask(tmp_path, volume):
    path = write_submission(tmp_path / "p.h5", extract_surface(volume), 0.004, 0.004)
    with h5py.File(path, "r") as f:
        assert "mask" not in f
        assert "surface" in f


def test_build_submission_phantom(volume):
    res = build_submission(volume, with_mask=False)
    assert res["mask"] is None and res["mask_png"] is None
    assert res["surface"].shape == (8, 6)
    # PNG bytes decode to an image of the right size (PIL size is (w, h))
    assert Image.open(io.BytesIO(res["surface_png"])).size == (6, 8)
    assert res["stats"]["coverage_pct"] == 100.0
    assert "muscle_pct" not in res["stats"]


def test_build_submission_tissue_has_mask(volume):
    res = build_submission(volume, with_mask=True)
    assert res["mask"] is not None
    assert res["mask_png"] is not None
    assert "muscle_pct" in res["stats"]
    assert Image.open(io.BytesIO(res["mask_png"])).size == (6, 8)


def test_describe_submission_text(tmp_path, volume):
    res = build_submission(volume, with_mask=True)
    write_submission(tmp_path / "s.h5", res["surface"], 0.004, 0.004, res["mask"])
    text = describe_submission(tmp_path / "s.h5")
    assert "surface" in text and "double" in text
    assert "0.004000" in text
    assert "muscle" in text
