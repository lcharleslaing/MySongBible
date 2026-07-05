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
    whisper_binary_ready = bool(
        settings.whisper_cpp_binary
        and settings.whisper_cpp_binary.exists()
        and settings.whisper_cpp_binary.is_file()
    )
    whisper_model_ready = bool(
        settings.whisper_model_path
        and settings.whisper_model_path.exists()
        and settings.whisper_model_path.is_file()
    )
    whisper_ready = whisper_binary_ready and whisper_model_ready
    if whisper_ready:
        whisper_message = "Whisper binary and model files are ready."
    elif not settings.whisper_cpp_binary and not settings.whisper_model_path:
        whisper_message = "Whisper binary and model paths are not configured."
    elif not whisper_binary_ready:
        whisper_message = "Whisper binary path is missing or does not point to an existing file."
    else:
        whisper_message = "WHISPER_MODEL_PATH is missing or does not point to an existing model file."

    manager = TtsEngineManager(settings)
    engines = manager.get_engine_statuses()
    tts_ready = any(engine.id == settings.tts_engine and engine.available for engine in engines)
    tts_message = (
        f"{settings.tts_engine} TTS is ready."
        if tts_ready
        else f"{settings.tts_engine} TTS is not ready on this machine."
    )

    return VoiceStatusResponse(
        status="ready" if whisper_ready or tts_ready else "needs_configuration",
        stt_engine="whisper.cpp" if whisper_ready else "whisper.cpp (needs configuration)",
        stt_ready=whisper_ready,
        stt_message=whisper_message,
        tts_engine=settings.tts_engine,
        tts_ready=tts_ready,
        tts_message=tts_message,
        default_engine=settings.tts_engine,
        engines=[asdict(engine) for engine in engines],
        whisper_cpp_binary=str(settings.whisper_cpp_binary) if settings.whisper_cpp_binary else None,
        whisper_model_path=str(settings.whisper_model_path) if settings.whisper_model_path else None,
        piper_binary=str(settings.piper_binary) if settings.piper_binary else None,
        piper_model_path=str(settings.piper_model_path) if settings.piper_model_path else None,
        message="Voice integrations stay local-only. whisper.cpp requires a configured binary and model path, while TTS currently supports the built-in mock engine and Piper when configured.",
    )
