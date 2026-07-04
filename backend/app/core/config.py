from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field, field_validator
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

    whisper_cpp_binary: Path | None = Field(
        default=None,
        validation_alias=AliasChoices("WHISPER_CPP_BINARY", "WHISPER_CPP_PATH"),
    )
    whisper_model_path: Path | None = Field(
        default=None,
        validation_alias=AliasChoices("WHISPER_MODEL_PATH", "WHISPER_MODEL_DIR"),
    )
    whisper_thread_count: int = 4
    keep_uploaded_audio_files: bool = True
    default_stt_model: str | None = None
    tts_engine: str = Field(
        default="mock",
        validation_alias=AliasChoices("TTS_ENGINE", "DEFAULT_TTS_ENGINE"),
    )
    piper_binary: Path | None = None
    piper_model_path: Path | None = None
    tts_output_dir: Path | None = None

    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        populate_by_name=True,
    )

    @field_validator(
        "whisper_cpp_binary",
        "whisper_model_path",
        "piper_binary",
        "piper_model_path",
        "default_stt_model",
        mode="before",
    )
    @classmethod
    def empty_string_to_none(cls, value: object) -> object:
        if isinstance(value, str) and value.strip() == "":
            return None
        return value

    @field_validator(
        "app_data_dir",
        "whisper_cpp_binary",
        "whisper_model_path",
        "piper_binary",
        "piper_model_path",
        "tts_output_dir",
        mode="before",
    )
    @classmethod
    def normalize_paths(cls, value: object) -> object:
        if isinstance(value, str):
            return Path(value)
        return value

    @property
    def audio_input_dir(self) -> Path:
        return self.app_data_dir / "audio" / "input"

    @property
    def audio_tts_dir(self) -> Path:
        return self.tts_output_dir or (self.app_data_dir / "audio" / "tts")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
