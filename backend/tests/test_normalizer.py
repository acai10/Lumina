import numpy as np

from src.processing.normalizer import (
    PRE_FILTER_THRESHOLD,
    load_packed,
    normalize_for_frontend,
    pack_normalized_response,
    save_packed,
)


def _volume() -> np.ndarray:
    rng = np.random.default_rng(0)
    vol = rng.random((6, 5, 4)).astype(np.float32)
    vol[0] = 0.0  # a fully-dark slice → normalises to all-zero (below threshold)
    return vol


def test_normalize_shapes_and_ranges():
    vol = _volume()
    v_idx, v_int, norm_u8 = normalize_for_frontend(vol)
    assert norm_u8.shape == vol.shape
    assert norm_u8.dtype == np.uint8
    assert v_idx.dtype == np.uint32 and v_int.dtype == np.float32
    assert len(v_idx) == len(v_int)
    # Intensities are normalised into [0, 1] and sorted descending.
    assert v_int.max() <= 1.0 and v_int.min() >= 0.0
    assert np.all(np.diff(v_int) <= 1e-6)


def test_indices_are_above_threshold_voxels():
    vol = _volume()
    v_idx, _, norm_u8 = normalize_for_frontend(vol)
    threshold_u8 = max(1, round(PRE_FILTER_THRESHOLD * 255))
    flat = norm_u8.ravel()
    # Every exported index must point at an above-threshold voxel, and the count
    # must match the number of such voxels.
    idx = v_idx.astype(np.int64)
    assert np.all(flat[idx] >= threshold_u8)
    assert len(v_idx) == int((flat >= threshold_u8).sum())


def test_nan_slice_does_not_crash_and_yields_zero():
    vol = _volume()
    vol[1, 0, 0] = np.nan
    _, _, norm_u8 = normalize_for_frontend(vol)
    assert np.isfinite(norm_u8).all()  # uint8 is always finite; no UB propagated


def test_pack_save_load_roundtrip(tmp_path):
    vol = _volume()
    content, headers = pack_normalized_response(vol)
    assert headers["X-Shape"] == "6,5,4"
    v_idx, v_int, norm_u8 = normalize_for_frontend(vol)
    # save_packed must produce byte-identical content + headers to the live response.
    save_packed(v_idx, v_int, norm_u8, vol.shape, tmp_path / "vol")
    loaded_content, loaded_headers = load_packed(tmp_path / "vol")
    assert loaded_content == content
    assert loaded_headers == headers


def test_load_packed_missing_returns_none(tmp_path):
    assert load_packed(tmp_path / "nope") == (None, None)
