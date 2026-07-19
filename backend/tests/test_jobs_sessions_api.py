"""Fail-fast validation tests for the jobs, sessions, and cleanup routers.

Every case here errors before the background pipeline would start, so no
stitcher actually runs.
"""

import numpy as np
import pytest
from fastapi.testclient import TestClient

from src.config import settings
from src.processing import volume_cache
from src.processing.h5_reader import save_oct_volume
from src.processing.runner import job_store
from src.processing.session_runner import session_store
from src.schemas.enums import JobStatus


@pytest.fixture
def stored_volume() -> str:
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    volume_cache.clear()
    vid = "test-jobs-api-source"
    vol = np.random.default_rng(0).random((4, 6, 5)).astype(np.float32)
    save_oct_volume(settings.uploads_dir / f"{vid}.h5", vol)
    yield vid
    (settings.uploads_dir / f"{vid}.h5").unlink(missing_ok=True)


# ── Jobs ──────────────────────────────────────────────────────────────────────


def test_job_create_missing_volume_404(client: TestClient) -> None:
    res = client.post("/jobs/", json={"volume_id": "nope", "stitchers": []})
    assert res.status_code == 404


def test_job_create_unknown_stitcher_400(client: TestClient, stored_volume: str) -> None:
    res = client.post("/jobs/", json={"volume_id": stored_volume, "stitchers": ["warp9"]})
    assert res.status_code == 400
    assert "warp9" in res.json()["detail"]


def test_job_create_rejects_path_traversal_volume_id(client: TestClient) -> None:
    # Body-supplied ids are joined into an uploads_dir path; separators must
    # fail validation (422) instead of reaching the filesystem.
    res = client.post("/jobs/", json={"volume_id": "../../etc/passwd", "stitchers": []})
    assert res.status_code == 422


def test_job_poll_unknown_404(client: TestClient) -> None:
    assert client.get("/jobs/unknown-id").status_code == 404


# ── Sessions ──────────────────────────────────────────────────────────────────


def _entries(vid: str) -> list[dict[str, object]]:
    return [
        {"volume_id": vid, "row": 0, "col": 0},
        {"volume_id": vid, "row": 0, "col": 1},
    ]


def test_session_create_requires_two_volumes(client: TestClient) -> None:
    res = client.post("/sessions/", json={"volumes": [{"volume_id": "a", "row": 0, "col": 0}]})
    assert res.status_code == 400


def test_session_create_rejects_duplicate_grid_position(
    client: TestClient, stored_volume: str
) -> None:
    entries = _entries(stored_volume)
    entries[1]["row"], entries[1]["col"] = 0, 0
    res = client.post("/sessions/", json={"volumes": entries})
    assert res.status_code == 400
    assert "Duplicate grid position" in res.json()["detail"]


def test_session_create_rejects_unknown_method(client: TestClient, stored_volume: str) -> None:
    res = client.post(
        "/sessions/", json={"volumes": _entries(stored_volume), "method": "telekinesis"}
    )
    assert res.status_code == 400
    assert "telekinesis" in res.json()["detail"]


def test_session_create_missing_volume_404(client: TestClient) -> None:
    res = client.post(
        "/sessions/",
        json={
            "volumes": [
                {"volume_id": "ghost-a", "row": 0, "col": 0},
                {"volume_id": "ghost-b", "row": 0, "col": 1},
            ]
        },
    )
    assert res.status_code == 404


def test_session_create_rejects_path_traversal_volume_id(client: TestClient) -> None:
    res = client.post(
        "/sessions/",
        json={
            "volumes": [
                {"volume_id": "../secret", "row": 0, "col": 0},
                {"volume_id": "ok", "row": 0, "col": 1},
            ]
        },
    )
    assert res.status_code == 422


def test_session_poll_unknown_404(client: TestClient) -> None:
    assert client.get("/sessions/unknown-id").status_code == 404


# ── Cleanup ───────────────────────────────────────────────────────────────────


def test_cleanup_refuses_while_job_running(client: TestClient) -> None:
    state = job_store.create("test-cleanup-running")
    state.status = JobStatus.RUNNING
    try:
        assert client.delete("/cleanup/").status_code == 409
    finally:
        state.status = JobStatus.DONE
        job_store.clear_finished()


def test_cleanup_deletes_files_and_reports_count(client: TestClient) -> None:
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    probe = settings.uploads_dir / "test-cleanup-probe.bin"
    probe.write_bytes(b"x")
    assert not job_store.any_running() and not session_store.any_running()

    res = client.delete("/cleanup/")
    assert res.status_code == 200
    body = res.json()
    assert body["deleted"] >= 1
    assert not probe.exists()
