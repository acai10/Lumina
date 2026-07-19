"""Tests for Settings env parsing: comma-separated and JSON CORS_ORIGINS."""

from src.config import Settings


def test_cors_origins_comma_separated_env(monkeypatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "http://a:1,http://b:2")
    assert Settings().cors_origins == ["http://a:1", "http://b:2"]


def test_cors_origins_json_env(monkeypatch) -> None:
    # pydantic-settings' native JSON list format must keep working alongside
    # the comma-separated convenience form.
    monkeypatch.setenv("CORS_ORIGINS", '["http://a:1", "http://b:2"]')
    assert Settings().cors_origins == ["http://a:1", "http://b:2"]


def test_cors_origins_comma_separated_dotenv(tmp_path, monkeypatch) -> None:
    # The documented docker-compose format must also work from a .env file —
    # the standard dotenv source would crash on a non-JSON list value.
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    (tmp_path / ".env").write_text("CORS_ORIGINS=http://x:5173,http://y:5173\n")
    monkeypatch.chdir(tmp_path)
    assert Settings().cors_origins == ["http://x:5173", "http://y:5173"]


def test_cors_origins_default(monkeypatch, tmp_path) -> None:
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    monkeypatch.chdir(tmp_path)  # no .env here
    assert Settings().cors_origins == ["http://localhost:5173"]


def test_env_var_beats_dotenv(tmp_path, monkeypatch) -> None:
    (tmp_path / ".env").write_text("CORS_ORIGINS=http://dotenv:1\n")
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("CORS_ORIGINS", "http://env:2")
    assert Settings().cors_origins == ["http://env:2"]
