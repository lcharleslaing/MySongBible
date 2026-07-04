from collections.abc import Generator

from fastapi import Depends
from sqlmodel import Session

from app.core.config import Settings, get_settings
from app.db.session import engine
from app.local_ai.stt.whisper_cpp import WhisperCppTranscriber
from app.local_ai.tts.manager import TtsEngineManager
from app.services.settings import SettingsService


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


def get_app_settings() -> Settings:
    return get_settings()


def get_settings_service(
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_app_settings),
) -> SettingsService:
    return SettingsService(session, settings)


def get_whisper_cpp_transcriber(
    settings_service: SettingsService = Depends(get_settings_service),
) -> WhisperCppTranscriber:
    return WhisperCppTranscriber(settings_service.get_runtime_settings())


def get_tts_engine_manager(
    settings_service: SettingsService = Depends(get_settings_service),
) -> TtsEngineManager:
    return TtsEngineManager(settings_service.get_runtime_settings())
