import pytest

from src.processing.runner import JobStore
from src.schemas.enums import JobStatus


@pytest.fixture
def store() -> JobStore:
    return JobStore()


def test_create_returns_pending_state(store: JobStore) -> None:
    state = store.create("job-1")
    assert state.status == JobStatus.PENDING
    assert state.results == {}
    assert state.error is None


def test_get_returns_none_for_unknown_id(store: JobStore) -> None:
    assert store.get("does-not-exist") is None


def test_get_returns_state_after_create(store: JobStore) -> None:
    store.create("job-2")
    state = store.get("job-2")
    assert state is not None
    assert state.status == JobStatus.PENDING


def test_create_multiple_jobs_are_independent(store: JobStore) -> None:
    state_a = store.create("job-a")
    state_b = store.create("job-b")
    state_a.status = JobStatus.DONE
    assert store.get("job-b").status == JobStatus.PENDING  # type: ignore[union-attr]


def test_mutating_returned_state_is_reflected_in_store(store: JobStore) -> None:
    state = store.create("job-3")
    state.status = JobStatus.RUNNING
    assert store.get("job-3").status == JobStatus.RUNNING  # type: ignore[union-attr]
