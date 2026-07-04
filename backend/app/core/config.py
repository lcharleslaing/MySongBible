from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "AppTemplateBase Backend"
    app_env: str = "development"
    log_level: str = "INFO"

    backend_host: str = "127.0.0.1"
    backend_port: int = 8000

    app_data_dir: Path = Path("./data")
    database_url: str = "sqlite:///./data/app_template_base.sqlite3"
    database_echo: bool = False

    whisper_cpp_path: str | None = None
    whisper_model_dir: str | None = None
    default_stt_model: str | None = None
    default_tts_engine: str = "placeholder"

    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @field_validator("whisper_cpp_path", "whisper_model_dir", "default_stt_model", mode="before")
    @classmethod
    def empty_string_to_none(cls, value: object) -> object:
        if isinstance(value, str) and value.strip() == "":
            return None
        return value

    @field_validator("app_data_dir", mode="before")
    @classmethod
    def normalize_app_data_dir(cls, value: object) -> object:
        if isinstance(value, str):
            return Path(value)
        return value


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
