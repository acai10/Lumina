"""Application settings, loaded from environment variables and ``.env``.

Import ``settings`` from this module everywhere; never re-read env vars.
Precedence (highest first): constructor args > process env > ``.env`` file >
file secrets. ``CORS_ORIGINS`` may be given either as pydantic-settings' native
JSON (``["http://a","http://b"]``) or as the plain comma-separated form used in
``docker-compose.yml`` (``http://a,http://b``).
"""

from pathlib import Path

from pydantic import Field
from pydantic.fields import FieldInfo
from pydantic_settings import (
    BaseSettings,
    DotEnvSettingsSource,
    EnvSettingsSource,
    PydanticBaseSettingsSource,
)

#: list[str] fields that accept the plain comma-separated form.
_COMMA_SEP_FIELDS = frozenset({"cors_origins"})


def _split_comma_list(value: str) -> list[str] | None:
    """Split a plain comma-separated string; ``None`` for JSON-formatted values.

    Args:
        value: The raw string from the environment/dotenv source.

    Returns:
        The split list, or ``None`` when the value looks like JSON (starts with
        ``[``) and should keep pydantic-settings' standard parsing.
    """
    if value.lstrip().startswith("["):
        return None
    return [o.strip() for o in value.split(",") if o.strip()]


class _CommaSepEnvSource(EnvSettingsSource):
    """Process-env source that accepts comma-separated strings for list fields.

    pydantic_settings normally requires JSON format (``["a","b"]``) for list
    fields. Docker Compose sets env vars as plain strings such as
    ``http://localhost:5173,https://prod.example.com``, so we intercept
    those fields and split before passing to Pydantic.
    """

    def prepare_field_value(
        self, field_name: str, field: FieldInfo, value: object, value_is_complex: bool
    ) -> object:
        if field_name in _COMMA_SEP_FIELDS and isinstance(value, str):
            split = _split_comma_list(value)
            if split is not None:
                return split
        return super().prepare_field_value(field_name, field, value, value_is_complex)


class _CommaSepDotEnvSource(DotEnvSettingsSource):
    """``.env``-file source with the same comma-separated support.

    Without this, ``CORS_ORIGINS=http://a,http://b`` would work as a process
    env var but crash the app at import when placed in ``backend/.env`` —
    the standard dotenv source insists on JSON for list fields.
    """

    def prepare_field_value(
        self, field_name: str, field: FieldInfo, value: object, value_is_complex: bool
    ) -> object:
        if field_name in _COMMA_SEP_FIELDS and isinstance(value, str):
            split = _split_comma_list(value)
            if split is not None:
                return split
        return super().prepare_field_value(field_name, field, value, value_is_complex)


class Settings(BaseSettings):
    """Backend configuration.

    Attributes:
        uploads_dir: Working directory for uploaded/derived volumes
            (env: ``UPLOADS_DIR``). Never commit its contents.
        data_dir: Root of locally-available source ``.h5`` files
            (env: ``DATA_DIR``). When the backend shares a filesystem with the
            data, volumes can be registered by path instead of uploaded — see
            ``POST /volumes/register``.
        cors_origins: Allowed browser origins (env: ``CORS_ORIGINS``,
            JSON or comma-separated).
    """

    uploads_dir: Path = Path("uploads")
    data_dir: Path = Path("data")
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

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
        """Swap the env and dotenv sources for the comma-separated variants.

        Keeps the standard precedence: init args > process env > ``.env`` file >
        file secrets.
        """
        return (
            init_settings,
            _CommaSepEnvSource(settings_cls),
            _CommaSepDotEnvSource(
                settings_cls,
                env_file=cls.model_config.get("env_file"),
                env_file_encoding=cls.model_config.get("env_file_encoding"),
            ),
            file_secret_settings,
        )


settings = Settings()
