from collections.abc import Generator

from fastapi import Depends
from sqlmodel import Session

from app.core.config import Settings, get_settings
from app.db.session import engine
from app.local_ai.stt.whisper_cpp import WhisperCppTranscriber


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session


def get_app_settings() -> Settings:
    return get_settings()


def get_whisper_cpp_transcriber(
    settings: Settings = Depends(get_app_settings),
) -> WhisperCppTranscriber:
    return WhisperCppTranscriber(settings)
