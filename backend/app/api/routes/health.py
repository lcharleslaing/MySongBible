import os
from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlmodel import Session

from app.api.dependencies import get_app_settings
from app.core.config import Settings
from app.schemas.health import HealthResponse
from app.api.dependencies import get_session

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def get_health(
    settings: Settings = Depends(get_app_settings),
    session: Session = Depends(get_session),
) -> HealthResponse:
    database_ok = True
    database_error = None
    try:
        session.exec(text("SELECT 1"))
    except Exception as error:  # health must report failures, not crash
        database_ok = False
        database_error = str(error)
    whisper_binary = settings.whisper_cpp_binary
    whisper_model = settings.whisper_model_path
    piper_binary = settings.piper_binary
    piper_model = settings.piper_model_path
    return HealthResponse(
        status="ok" if database_ok else "degraded",
        app_name="VideoShareApp",
        backend_version="0.1.0",
        identity="com.localfirst.videoshareapp.backend",
        runtime_directory=str(settings.app_data_dir),
        database={"ready": database_ok, "path": settings.database_url.removeprefix("sqlite:///"), "error": database_error},
        whisper={"configured": bool(whisper_binary and whisper_model), "ready": bool(whisper_binary and whisper_binary.is_file() and os.access(whisper_binary, os.X_OK) and whisper_model and whisper_model.is_file())},
        piper={"configured": bool(piper_binary and piper_model), "ready": bool(piper_binary and piper_binary.is_file() and os.access(piper_binary, os.X_OK) and piper_model and piper_model.is_file())},
        local_ai_chat={"configured": bool(settings.local_chat_model), "provider": settings.local_chat_provider, "model": settings.local_chat_model, "endpoint": settings.local_chat_endpoint},
    )


@router.get("/identity")
async def get_identity() -> dict[str, str]:
    return {"app_name": "VideoShareApp", "identity": "com.localfirst.videoshareapp.backend", "backend_version": "0.1.0"}
