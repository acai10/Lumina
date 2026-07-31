"""API tests for the volumes router: upload validation, register, filter."""

import io

import h5py
import numpy as np
import pytest
from fastapi.testclient import TestClient

from src.config import settings
from src.processing import volume_cache
from src.processing.h5_reader import OCT_DIMS, save_oct_volume


def _lazy_oct_h5(path, shape=OCT_DIMS) -> None:
    """Write an ``.h5`` whose "OCT" dataset has *shape* but ~zero bytes on disk.

    The dataset is chunked+compressed and never written, so only metadata is
    stored — validation reads ``ds.shape``/``ds.size`` only, never the data.
    """
    with h5py.File(path, "w") as f:
        f.create_dataset("OCT", shape=shape, dtype="f4", chunks=True, compression="gzip")


@pytest.fixture
def small_volume() -> str:
    """A small real volume in uploads_dir for the filter endpoint tests."""
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    volume_cache.clear()
    vid = "test-volumes-api-source"
    vol = np.random.default_rng(0).random((4, 6, 5)).astype(np.float32)
    save_oct_volume(settings.uploads_dir / f"{vid}.h5", vol)
    yield vid
    (settings.uploads_dir / f"{vid}.h5").unlink(missing_ok=True)


# ── Upload validation ─────────────────────────────────────────────────────────


def test_upload_rejects_non_h5_extension(client: TestClient) -> None:
    files = {"file": ("scan.txt", io.BytesIO(b"x"), "text/plain")}
    res = client.post("/volumes/upload", files=files)
    assert res.status_code == 400


def test_upload_rejects_non_hdf5_bytes_as_400(client: TestClient) -> None:
    # Not valid HDF5 at all — h5py raises OSError, which must surface as a
    # client error (400), not an internal 500.
    res = client.post(
        "/volumes/upload",
        files={"file": ("scan.h5", io.BytesIO(b"this is not hdf5"), "application/octet-stream")},
    )
    assert res.status_code == 400
    # The staged temp file must not linger after a rejected upload.
    assert not list(settings.uploads_dir.glob("*.h5.part"))


def test_upload_rejects_wrong_shape(client: TestClient, tmp_path) -> None:
    bad = tmp_path / "bad.h5"
    _lazy_oct_h5(bad, shape=(2, 3, 4))
    res = client.post("/volumes/upload", files={"file": ("bad.h5", bad.read_bytes())})
    assert res.status_code == 400


def test_upload_rejects_missing_oct_dataset(client: TestClient, tmp_path) -> None:
    bad = tmp_path / "nods.h5"
    with h5py.File(bad, "w") as f:
        f.create_dataset("other", data=np.zeros((2, 2), dtype=np.float32))
    res = client.post("/volumes/upload", files={"file": ("nods.h5", bad.read_bytes())})
    assert res.status_code == 400


# ── Register by path ──────────────────────────────────────────────────────────


def test_register_rejects_path_traversal(client: TestClient) -> None:
    res = client.post("/volumes/register", json={"path": "../outside.h5"})
    assert res.status_code == 400
    assert "escapes" in res.json()["detail"]


def test_register_rejects_non_h5_suffix(client: TestClient, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    (tmp_path / "scan.txt").write_bytes(b"x")
    res = client.post("/volumes/register", json={"path": "scan.txt"})
    assert res.status_code == 400


def test_register_missing_file_404(client: TestClient, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    res = client.post("/volumes/register", json={"path": "nope.h5"})
    assert res.status_code == 404


def test_register_subdir_ids_do_not_collide(client: TestClient, tmp_path, monkeypatch) -> None:
    # Two files with the same stem in different subfolders must get distinct,
    # deterministic ids — a bare-stem id would silently repoint the symlink.
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    for sub in ("a", "b"):
        (tmp_path / sub).mkdir()
        _lazy_oct_h5(tmp_path / sub / "scan.h5")

    id_a = client.post("/volumes/register", json={"path": "a/scan.h5"}).json()["volume_id"]
    id_b = client.post("/volumes/register", json={"path": "b/scan.h5"}).json()["volume_id"]
    id_a2 = client.post("/volumes/register", json={"path": "a/scan.h5"}).json()["volume_id"]
    try:
        assert id_a != id_b
        assert id_a == id_a2  # deterministic: same path → same id
        assert (settings.uploads_dir / f"{id_a}.h5").is_symlink()
    finally:
        (settings.uploads_dir / f"{id_a}.h5").unlink(missing_ok=True)
        (settings.uploads_dir / f"{id_b}.h5").unlink(missing_ok=True)


def test_register_root_file_keeps_plain_stem(client: TestClient, tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    _lazy_oct_h5(tmp_path / "rootscan.h5")
    res = client.post("/volumes/register", json={"path": "rootscan.h5"})
    try:
        assert res.status_code == 200
        assert res.json()["volume_id"] == "rootscan"
    finally:
        (settings.uploads_dir / "rootscan.h5").unlink(missing_ok=True)


# ── Filter + normalized endpoints ─────────────────────────────────────────────


def test_filter_unknown_type_returns_400(client: TestClient, small_volume: str) -> None:
    res = client.post(
        f"/volumes/{small_volume}/filter",
        json={"filter_chain": [{"type": "nonexistent", "params": {}}]},
    )
    assert res.status_code == 400
    assert "Unknown filter type" in res.json()["detail"]


def test_filter_segment_endpoint_roundtrip(client: TestClient, small_volume: str) -> None:
    # The muscle/fat segmentation runs as a regular pipeline filter through the
    # lean filter endpoint and returns the normal packed binary.
    res = client.post(
        f"/volumes/{small_volume}/filter",
        json={"filter_chain": [{"type": "segment", "params": {}}]},
    )
    assert res.status_code == 200
    assert res.headers["X-Shape"] == "4,6,5"
    v_count = int(res.headers["X-VCount"])
    assert len(res.content) == v_count * 8 + 4 * 6 * 5


def test_filter_missing_volume_404(client: TestClient) -> None:
    res = client.post("/volumes/does-not-exist/filter", json={"filter_chain": []})
    assert res.status_code == 404


def test_normalized_roundtrip_headers(client: TestClient, small_volume: str) -> None:
    res = client.get(f"/volumes/{small_volume}/normalized")
    assert res.status_code == 200
    assert res.headers["X-Shape"] == "4,6,5"
    v_count = int(res.headers["X-VCount"])
    # Packed layout: vCount×4 (uint32) + vCount×4 (float32) + total×1 (uint8).
    assert len(res.content) == v_count * 8 + 4 * 6 * 5


def test_normalized_missing_volume_404(client: TestClient) -> None:
    assert client.get("/volumes/does-not-exist/normalized").status_code == 404
