import pytest
from fastapi.testclient import TestClient

from main import app


@pytest.fixture
def client() -> TestClient:
    """Return a synchronous FastAPI test client."""
    with TestClient(app) as test_client:
        yield test_client
