from pydantic import BaseModel, Field, field_validator


class PublicSettingsResponse(BaseModel):
    app_name: str
    app_env: str
    database_url: str
    sqlite_database_path: str
    app_data_dir: str
    whisper_cpp_binary: str | None
    whisper_model_path: str | None
    whisper_thread_count: int
    audio_input_dir: str
    keep_uploaded_audio_files: bool
    default_stt_model: str | None
    tts_engine: str
    piper_binary: str | None = None
    piper_model_path: str | None = None
    tts_output_dir: str | None = None
    tts_timeout_seconds: int
    database_path_editable: bool = False
    database_path_note: str = "SQLite database path is startup-only. Change DATABASE_URL and restart the backend to use another database."


class SettingsUpdateRequest(BaseModel):
    whisper_cpp_binary: str | None = None
    whisper_model_path: str | None = None
    whisper_thread_count: int = Field(ge=1, le=64)
    tts_engine: str = Field(min_length=1, max_length=100)
    piper_binary: str | None = None
    piper_model_path: str | None = None
    audio_input_dir: str = Field(min_length=1)
    tts_output_dir: str = Field(min_length=1)
    tts_timeout_seconds: int = Field(gt=0)
    sqlite_database_path: str | None = Field(default=None, min_length=1)

    @field_validator("tts_engine")
    @classmethod
    def validate_tts_engine(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"mock", "piper"}:
            raise ValueError("TTS engine must be mock or piper.")
        return normalized
