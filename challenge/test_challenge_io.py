import h5py
import numpy as np
import pytest

from challenge_io import (
    MASK_DATASET,
    SURFACE_DATASET,
    ChallengeResult,
    check_challenge_file,
    describe_h5,
    load_challenge_result,
    save_challenge_result,
    validate_challenge_file,
)

_H, _W = 16, 20


@pytest.fixture
def surface() -> np.ndarray:
    rng = np.random.default_rng(0)
    return (rng.random((_H, _W)) * 5.0).astype(np.float32)  # float32 on purpose


@pytest.fixture
def mask() -> np.ndarray:
    rng = np.random.default_rng(1)
    return (rng.random((_H, _W)) > 0.5).astype(np.int32)  # int on purpose


# ── save / load round trips ───────────────────────────────────────────────────


def test_phantom_roundtrip_has_no_mask(tmp_path, surface):
    path = save_challenge_result(tmp_path / "phantom.h5", surface, dx=0.1, dy=0.08)
    result = load_challenge_result(path)
    assert isinstance(result, ChallengeResult)
    assert not result.has_mask
    assert result.mask is None
    assert result.dx == pytest.approx(0.1)
    assert result.dy == pytest.approx(0.08)
    np.testing.assert_allclose(result.surface, surface.astype(np.float64))


def test_tissue_roundtrip_with_mask(tmp_path, surface, mask):
    path = save_challenge_result(tmp_path / "tissue.h5", surface, 0.1, 0.08, mask=mask)
    result = load_challenge_result(path)
    assert result.has_mask
    np.testing.assert_array_equal(result.mask, mask.astype(np.float64))


def test_datasets_are_double(tmp_path, surface, mask):
    path = save_challenge_result(tmp_path / "t.h5", surface, 0.1, 0.08, mask=mask)
    with h5py.File(path, "r") as f:
        assert f[SURFACE_DATASET].dtype == np.float64
        assert f[MASK_DATASET].dtype == np.float64


def test_dx_dy_are_attributes_of_surface(tmp_path, surface):
    path = save_challenge_result(tmp_path / "t.h5", surface, 0.1, 0.08)
    with h5py.File(path, "r") as f:
        assert float(f[SURFACE_DATASET].attrs["dx"]) == pytest.approx(0.1)
        assert float(f[SURFACE_DATASET].attrs["dy"]) == pytest.approx(0.08)


# ── save-time validation ──────────────────────────────────────────────────────


def test_save_rejects_non_2d_surface(tmp_path):
    with pytest.raises(ValueError, match="2D"):
        save_challenge_result(tmp_path / "x.h5", np.zeros((2, 3, 4)), 0.1, 0.08)


def test_save_rejects_nonpositive_spacing(tmp_path, surface):
    with pytest.raises(ValueError, match="> 0"):
        save_challenge_result(tmp_path / "x.h5", surface, 0.0, 0.08)


def test_save_rejects_mask_shape_mismatch(tmp_path, surface):
    with pytest.raises(ValueError, match="must match"):
        save_challenge_result(
            tmp_path / "x.h5", surface, 0.1, 0.08, mask=np.zeros((3, 3))
        )


def test_save_rejects_non_binary_mask(tmp_path, surface):
    bad = np.full((_H, _W), 2.0)
    with pytest.raises(ValueError, match="binary"):
        save_challenge_result(tmp_path / "x.h5", surface, 0.1, 0.08, mask=bad)


# ── file validation ───────────────────────────────────────────────────────────


def test_check_passes_for_valid_files(tmp_path, surface, mask):
    phantom = save_challenge_result(tmp_path / "p.h5", surface, 0.1, 0.08)
    tissue = save_challenge_result(tmp_path / "t.h5", surface, 0.1, 0.08, mask=mask)
    assert check_challenge_file(phantom, expect_mask=False) == []
    assert check_challenge_file(tissue, expect_mask=True) == []
    validate_challenge_file(phantom, expect_mask=False)  # must not raise
    validate_challenge_file(tissue, expect_mask=True)


def test_check_flags_expectation_mismatch(tmp_path, surface, mask):
    phantom = save_challenge_result(tmp_path / "p.h5", surface, 0.1, 0.08)
    tissue = save_challenge_result(tmp_path / "t.h5", surface, 0.1, 0.08, mask=mask)
    assert check_challenge_file(phantom, expect_mask=True)  # phantom lacks mask
    assert check_challenge_file(tissue, expect_mask=False)  # tissue has unexpected mask


def test_check_flags_missing_surface(tmp_path):
    path = tmp_path / "bad.h5"
    with h5py.File(path, "w") as f:
        f.create_dataset("something_else", data=np.zeros((4, 4)))
    problems = check_challenge_file(path)
    assert any(SURFACE_DATASET in p for p in problems)


def test_check_flags_missing_attributes(tmp_path, surface):
    path = tmp_path / "bad.h5"
    with h5py.File(path, "w") as f:
        f.create_dataset(SURFACE_DATASET, data=surface.astype(np.float64))  # no dx/dy
    problems = check_challenge_file(path)
    assert any("dx" in p for p in problems)
    assert any("dy" in p for p in problems)


def test_check_flags_wrong_dtype(tmp_path, surface):
    path = tmp_path / "bad.h5"
    with h5py.File(path, "w") as f:
        ds = f.create_dataset(SURFACE_DATASET, data=surface.astype(np.float32))
        ds.attrs["dx"] = 0.1
        ds.attrs["dy"] = 0.08
    problems = check_challenge_file(path)
    assert any("float64" in p for p in problems)


def test_validate_raises_with_all_problems(tmp_path):
    path = tmp_path / "bad.h5"
    with h5py.File(path, "w") as f:
        f.create_dataset("nope", data=np.zeros((2, 2)))
    with pytest.raises(ValueError, match="Invalid challenge file"):
        validate_challenge_file(path)


def test_load_missing_file_raises(tmp_path):
    with pytest.raises(FileNotFoundError):
        load_challenge_result(tmp_path / "does_not_exist.h5")


# ── describe ──────────────────────────────────────────────────────────────────


def test_describe_mentions_format(tmp_path, surface):
    path = save_challenge_result(tmp_path / "t.h5", surface, 0.1, 0.08)
    text = describe_h5(path)
    assert SURFACE_DATASET in text
    assert "double" in text
    assert "0.100000" in text
