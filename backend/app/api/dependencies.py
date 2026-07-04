from collections.abc import AsyncGenerator

from fastapi import Depends
from sqlmodel import Session

from app.core.config import Settings, get_settings
from app.db.session import engine
from app.local_ai.stt.whisper_cpp import WhisperCppTranscriber
from app.local_ai.tts.manager import TtsEngineManager
from app.services.settings import SettingsService


async def get_session() -> AsyncGenerator[Session, None]:
    with Session(engine) as session:
        yield session


async def get_app_settings() -> Settings:
    return get_settings()


async def get_settings_service(
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_app_settings),
) -> SettingsService:
    return SettingsService(session, settings)


async def get_whisper_cpp_transcriber(
    settings_service: SettingsService = Depends(get_settings_service),
) -> WhisperCppTranscriber:
    return WhisperCppTranscriber(settings_service.get_runtime_settings())


async def get_tts_engine_manager(
    settings_service: SettingsService = Depends(get_settings_service),
) -> TtsEngineManager:
    return TtsEngineManager(settings_service.get_runtime_settings())
