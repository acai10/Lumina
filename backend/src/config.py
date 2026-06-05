from pathlib import Path

from pydantic.fields import FieldInfo
from pydantic_settings import BaseSettings, EnvSettingsSource, PydanticBaseSettingsSource


class _CommaSepEnvSource(EnvSettingsSource):
    """Env source that accepts comma-separated strings for list[str] fields.

    pydantic_settings normally requires JSON format (``["a","b"]``) for list
    fields. Docker Compose sets env vars as plain strings such as
    ``http://localhost:5173,https://prod.example.com``, so we intercept
    those fields and split before passing to Pydantic.
    """

    _COMMA_SEP_FIELDS = frozenset({"cors_origins"})

    def prepare_field_value(
        self, field_name: str, field: FieldInfo, value: object, value_is_complex: bool
    ) -> object:
        if field_name in self._COMMA_SEP_FIELDS and isinstance(value, str):
            return [o.strip() for o in value.split(",") if o.strip()]
        return super().prepare_field_value(field_name, field, value, value_is_complex)


class Settings(BaseSettings):
    uploads_dir: Path = Path("uploads")
    #: Root directory of locally-available source ``.h5`` files. When the backend
    #: shares a filesystem with the data (same-machine setup), volumes can be
    #: registered by path instead of uploaded — see ``POST /volumes/register``.
    data_dir: Path = Path("data")
    cors_origins: list[str] = ["http://localhost:5173"]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        return (
            init_settings,
            _CommaSepEnvSource(settings_cls),
            dotenv_settings,
            file_secret_settings,
        )


settings = Settings()
