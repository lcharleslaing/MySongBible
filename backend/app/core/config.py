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
    cors_origins: list[str] = Field(
        default_factory=lambda: [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "file://",
            "null",
        ],
        validation_alias=AliasChoices("CORS_ORIGINS", "BACKEND_CORS_ORIGINS"),
    )

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
    audio_input_dir_override: Path | None = Field(default=None, validation_alias=AliasChoices("AUDIO_INPUT_DIR"))
    keep_uploaded_audio_files: bool = True
    max_upload_size_bytes: int = 50 * 1024 * 1024
    allowed_audio_extensions: list[str] = Field(
        default_factory=lambda: ["wav", "mp3", "ogg", "flac", "m4a"],
        validation_alias=AliasChoices("ALLOWED_AUDIO_EXTENSIONS"),
    )
    allowed_audio_mime_types: list[str] = Field(
        default_factory=lambda: [
            "audio/wav",
            "audio/x-wav",
            "audio/mpeg",
            "audio/mp3",
            "audio/ogg",
            "audio/flac",
            "audio/x-flac",
            "audio/mp4",
            "audio/m4a",
        ],
        validation_alias=AliasChoices("ALLOWED_AUDIO_MIME_TYPES"),
    )
    default_stt_model: str | None = None
    whisper_timeout_seconds: int = 120
    tts_engine: str = Field(
        default="mock",
        validation_alias=AliasChoices("TTS_ENGINE", "DEFAULT_TTS_ENGINE"),
    )
    piper_binary: Path | None = None
    piper_model_path: Path | None = None
    tts_output_dir: Path | None = None
    tts_timeout_seconds: int = Field(default=120, validation_alias=AliasChoices("TTS_TIMEOUT_SECONDS", "PIPER_TIMEOUT_SECONDS"))

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
        "audio_input_dir_override",
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
        "audio_input_dir_override",
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

    @field_validator("cors_origins", "allowed_audio_extensions", "allowed_audio_mime_types", mode="before")
    @classmethod
    def split_csv_values(cls, value: object) -> object:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        return value

    @property
    def audio_input_dir(self) -> Path:
        return self.audio_input_dir_override or (self.app_data_dir / "audio" / "input")

    @property
    def audio_tts_dir(self) -> Path:
        return self.tts_output_dir or (self.app_data_dir / "audio" / "tts")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
