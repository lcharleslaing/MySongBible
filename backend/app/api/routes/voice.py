from fastapi import APIRouter

from app.core.config import get_settings
from app.schemas.voice import VoiceStatusResponse

router = APIRouter(tags=["voice"])


@router.get("/voice/status", response_model=VoiceStatusResponse)
def get_voice_status() -> VoiceStatusResponse:
    settings = get_settings()
    return VoiceStatusResponse(
        status="placeholder",
        stt_engine="whisper.cpp (not configured)",
        tts_engine=settings.default_tts_engine,
        whisper_cpp_binary=str(settings.whisper_cpp_binary) if settings.whisper_cpp_binary else None,
        whisper_model_path=str(settings.whisper_model_path) if settings.whisper_model_path else None,
        message="Voice integrations are intentionally stubbed in this phase.",
    )
