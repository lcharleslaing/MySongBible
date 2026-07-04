from pydantic import BaseModel


class PublicSettingsResponse(BaseModel):
    app_name: str
    app_env: str
    database_url: str
    sqlite_database_path: str
    app_data_dir: str
    whisper_cpp_binary: str | None
    whisper_model_path: str | None
    whisper_thread_count: int
    keep_uploaded_audio_files: bool
    default_stt_model: str | None
    default_tts_engine: str
    tts_engine: str
    piper_binary: str | None = None
    piper_model_path: str | None = None
    tts_output_dir: str | None = None


class SettingsUpdateRequest(BaseModel):
    whisper_cpp_binary: str | None = None
    whisper_model_path: str | None = None
    default_tts_engine: str
    sqlite_database_path: str
