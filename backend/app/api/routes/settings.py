from fastapi import APIRouter

from app.core.config import get_settings
from app.schemas.settings import PublicSettingsResponse

router = APIRouter(tags=["settings"])


@router.get("/settings", response_model=PublicSettingsResponse)
def get_settings_route() -> PublicSettingsResponse:
    settings = get_settings()
    return PublicSettingsResponse(
        app_name=settings.app_name,
        app_env=settings.app_env,
        database_url=settings.database_url,
        app_data_dir=str(settings.app_data_dir),
        whisper_cpp_binary=str(settings.whisper_cpp_binary) if settings.whisper_cpp_binary else None,
        whisper_model_path=str(settings.whisper_model_path) if settings.whisper_model_path else None,
        whisper_thread_count=settings.whisper_thread_count,
        keep_uploaded_audio_files=settings.keep_uploaded_audio_files,
        default_stt_model=settings.default_stt_model,
        default_tts_engine=settings.default_tts_engine,
    )
