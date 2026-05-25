from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    uploads_dir: Path = Path("uploads")
    cors_origins: list[str] = ["http://localhost:5173"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
