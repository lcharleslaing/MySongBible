from fastapi import APIRouter, Depends

from app.schemas.voice import VoiceStatusResponse
from app.services.settings import SettingsService
from app.api.dependencies import get_settings_service

router = APIRouter(tags=["voice"])


@router.get("/voice/status", response_model=VoiceStatusResponse)
def get_voice_status(settings_service: SettingsService = Depends(get_settings_service)) -> VoiceStatusResponse:
    settings = settings_service.get_runtime_settings()
    return VoiceStatusResponse(
        status="placeholder",
        stt_engine="whisper.cpp (not configured)",
        tts_engine=settings.tts_engine,
        whisper_cpp_binary=str(settings.whisper_cpp_binary) if settings.whisper_cpp_binary else None,
        whisper_model_path=str(settings.whisper_model_path) if settings.whisper_model_path else None,
        piper_binary=str(settings.piper_binary) if settings.piper_binary else None,
        piper_model_path=str(settings.piper_model_path) if settings.piper_model_path else None,
        message="Voice integrations support mock output today and Piper when configured. Future voice-cloning engines can be added through the same engine manager interface.",
    )
