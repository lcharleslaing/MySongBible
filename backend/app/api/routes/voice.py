from dataclasses import asdict

from fastapi import APIRouter, Depends

from app.schemas.voice import VoiceStatusResponse
from app.services.settings import SettingsService
from app.api.dependencies import get_settings_service
from app.local_ai.tts.manager import TtsEngineManager

router = APIRouter(tags=["voice"])


@router.get("/voice/status", response_model=VoiceStatusResponse)
async def get_voice_status(settings_service: SettingsService = Depends(get_settings_service)) -> VoiceStatusResponse:
    settings = settings_service.get_runtime_settings()
    whisper_ready = bool(settings.whisper_cpp_binary and settings.whisper_model_path)
    manager = TtsEngineManager(settings)
    engines = manager.get_engine_statuses()
    tts_ready = any(engine.id == settings.tts_engine and engine.available for engine in engines)

    return VoiceStatusResponse(
        status="ready" if whisper_ready or tts_ready else "needs_configuration",
        stt_engine="whisper.cpp" if whisper_ready else "whisper.cpp (needs configuration)",
        tts_engine=settings.tts_engine,
        default_engine=settings.tts_engine,
        engines=[asdict(engine) for engine in engines],
        whisper_cpp_binary=str(settings.whisper_cpp_binary) if settings.whisper_cpp_binary else None,
        whisper_model_path=str(settings.whisper_model_path) if settings.whisper_model_path else None,
        piper_binary=str(settings.piper_binary) if settings.piper_binary else None,
        piper_model_path=str(settings.piper_model_path) if settings.piper_model_path else None,
        message="Voice integrations stay local-only. whisper.cpp requires a configured binary and model path, while TTS currently supports the built-in mock engine and Piper when configured.",
    )
