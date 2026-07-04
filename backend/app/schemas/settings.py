from pydantic import BaseModel, Field


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


class SettingsUpdateRequest(BaseModel):
    whisper_cpp_binary: str | None = None
    whisper_model_path: str | None = None
    whisper_thread_count: int = Field(ge=1, le=64)
    tts_engine: str = Field(min_length=1, max_length=100)
    piper_binary: str | None = None
    piper_model_path: str | None = None
    audio_input_dir: str = Field(min_length=1)
    tts_output_dir: str = Field(min_length=1)
    sqlite_database_path: str = Field(min_length=1)
