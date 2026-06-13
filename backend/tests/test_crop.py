import numpy as np
import pytest
from fastapi.testclient import TestClient

from src.config import settings
from src.processing import volume_cache
from src.processing.h5_reader import load_volume_flexible, save_oct_volume


@pytest.fixture
def source_volume() -> str:
    """Write a small known source volume into uploads_dir; return its id."""
    settings.uploads_dir.mkdir(exist_ok=True)
    volume_cache.clear()
    vol = np.arange(8 * 6 * 5, dtype=np.float32).reshape(8, 6, 5)
    vid = "test-crop-source"
    save_oct_volume(settings.uploads_dir / f"{vid}.h5", vol)
    yield vid
    for stem in (vid,):
        (settings.uploads_dir / f"{stem}.h5").unlink(missing_ok=True)


def test_crop_returns_cropped_dims_and_content(client: TestClient, source_volume: str) -> None:
    box = {"x": 1, "y": 2, "z": 3, "width": 2, "height": 3, "depth": 4}
    res = client.post(f"/volumes/{source_volume}/crop", json=box)
    assert res.status_code == 200
    body = res.json()
    assert (body["n_slices"], body["height"], body["width"]) == (4, 3, 2)

    new_path = settings.uploads_dir / f"{body['volume_id']}.h5"
    try:
        assert new_path.exists()
        cropped = load_volume_flexible(new_path)
        source = np.arange(8 * 6 * 5, dtype=np.float32).reshape(8, 6, 5)
        expected = source[3:7, 2:5, 1:3]
        assert np.array_equal(cropped, expected)
    finally:
        new_path.unlink(missing_ok=True)


def test_crop_is_non_destructive(client: TestClient, source_volume: str) -> None:
    before = load_volume_flexible(settings.uploads_dir / f"{source_volume}.h5").copy()
    res = client.post(
        f"/volumes/{source_volume}/crop",
        json={"x": 0, "y": 0, "z": 0, "width": 2, "height": 2, "depth": 2},
    )
    assert res.status_code == 200
    after = load_volume_flexible(settings.uploads_dir / f"{source_volume}.h5")
    assert np.array_equal(before, after)
    (settings.uploads_dir / f"{res.json()['volume_id']}.h5").unlink(missing_ok=True)


def test_crop_out_of_bounds_returns_422(client: TestClient, source_volume: str) -> None:
    res = client.post(
        f"/volumes/{source_volume}/crop",
        json={"x": 0, "y": 0, "z": 0, "width": 99, "height": 2, "depth": 2},
    )
    assert res.status_code == 422


def test_crop_missing_volume_returns_404(client: TestClient) -> None:
    res = client.post(
        "/volumes/does-not-exist/crop",
        json={"x": 0, "y": 0, "z": 0, "width": 1, "height": 1, "depth": 1},
    )
    assert res.status_code == 404
