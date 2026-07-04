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
        whisper_cpp_path=settings.whisper_cpp_path,
        whisper_model_dir=settings.whisper_model_dir,
        default_stt_model=settings.default_stt_model,
        default_tts_engine=settings.default_tts_engine,
    )
