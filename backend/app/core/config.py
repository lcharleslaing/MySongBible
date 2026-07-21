from functools import lru_cache
from pathlib import Path
from typing import Annotated

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict
from app.core.runtime_paths import default_runtime_root


class Settings(BaseSettings):
    app_name: str = "VideoShareApp"
    app_env: str = "development"
    log_level: str = "INFO"
    log_dir: Path | None = None

    backend_host: str = "127.0.0.1"
    backend_port: int = 8000
    cors_origins: Annotated[list[str], NoDecode] = Field(
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

    app_data_dir: Path = Field(default_factory=default_runtime_root)
    database_url: str = ""
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
    allowed_audio_extensions: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["wav", "mp3", "ogg", "flac", "m4a", "webm"],
        validation_alias=AliasChoices("ALLOWED_AUDIO_EXTENSIONS"),
    )
    allowed_audio_mime_types: Annotated[list[str], NoDecode] = Field(
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
            "audio/webm",
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
    piper_json_config_path: Path | None = None
    tts_output_dir: Path | None = None
    tts_timeout_seconds: int = Field(default=120, validation_alias=AliasChoices("TTS_TIMEOUT_SECONDS", "PIPER_TIMEOUT_SECONDS"))
    local_chat_provider: str = "openai-compatible"
    local_chat_endpoint: str = "http://127.0.0.1:11434/v1"
    local_chat_model: str | None = None
    local_chat_timeout_seconds: int = 30
    local_chat_persist: bool = True

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
        "log_dir",
        "audio_input_dir_override",
        "piper_binary",
        "piper_model_path",
        "piper_json_config_path",
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
        "log_dir",
        "whisper_cpp_binary",
        "whisper_model_path",
        "audio_input_dir_override",
        "piper_binary",
        "piper_model_path",
        "piper_json_config_path",
        "tts_output_dir",
        mode="before",
    )
    @classmethod
    def normalize_paths(cls, value: object) -> object:
        if isinstance(value, str):
            if value.startswith("backend/"):
                return Path(__file__).resolve().parents[3] / value
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

    @property
    def audio_journal_dir(self) -> Path:
        return self.app_data_dir / "audio" / "journal"

    @property
    def audio_journal_originals_dir(self) -> Path:
        return self.audio_journal_dir / "originals"

    @property
    def audio_journal_rerecords_dir(self) -> Path:
        return self.audio_journal_dir / "rerecords"

    @property
    def audio_journal_imports_dir(self) -> Path:
        return self.audio_journal_dir / "imports"

    @property
    def audio_journal_processed_dir(self) -> Path:
        return self.audio_journal_dir / "processed"

    @property
    def audio_baselines_dir(self) -> Path:
        return self.app_data_dir / "audio" / "baselines"

    @property
    def voice_dataset_exports_dir(self) -> Path:
        return self.app_data_dir / "exports" / "voice-datasets"

    def model_post_init(self, __context: object) -> None:
        self.app_data_dir = self.app_data_dir.expanduser().resolve()
        if not self.database_url:
            self.database_url = f"sqlite:///{self.app_data_dir / 'database' / 'videoshareapp.sqlite3'}"
        if self.log_dir is None:
            self.log_dir = self.app_data_dir / "logs"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
