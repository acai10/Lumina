import base64

import numpy as np
import pytest
from fastapi.testclient import TestClient

from src.config import settings
from src.processing import volume_cache
from src.processing.h5_reader import save_oct_volume


@pytest.fixture
def two_class_volume() -> str:
    """A volume with a bright half (muscle) and a dim half (fat) → clean Otsu split."""
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    volume_cache.clear()
    vol = np.zeros((4, 10, 10), dtype=np.float32)
    vol[:, :, :5] = 0.1  # fat
    vol[:, :, 5:] = 0.9  # muscle
    vid = "test-mask-source"
    save_oct_volume(settings.uploads_dir / f"{vid}.h5", vol)
    yield vid
    (settings.uploads_dir / f"{vid}.h5").unlink(missing_ok=True)


def test_mask_endpoint_returns_png_and_muscle_pct(client: TestClient, two_class_volume: str):
    res = client.post(f"/volumes/{two_class_volume}/mask")
    assert res.status_code == 200
    body = res.json()
    assert body["volume_id"] == two_class_volume
    # Half the columns are the bright class → ~50% muscle.
    assert body["stats"]["muscle_pct"] == pytest.approx(50.0)
    # mask_png must be valid base64 decoding to a PNG signature.
    png = base64.b64decode(body["mask_png"])
    assert png[:8] == b"\x89PNG\r\n\x1a\n"


def test_mask_endpoint_404_for_unknown_volume(client: TestClient):
    res = client.post("/volumes/does-not-exist/mask")
    assert res.status_code == 404
