from fastapi import APIRouter

from app.api.routes.health import router as health_router
from app.api.routes.settings import router as settings_router
from app.api.routes.transcripts import router as transcripts_router
from app.api.routes.voice import router as voice_router

api_router = APIRouter()
api_router.include_router(health_router)
api_router.include_router(settings_router)
api_router.include_router(voice_router)
api_router.include_router(transcripts_router)
