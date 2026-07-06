from fastapi import APIRouter

from app.api.routes.app_cloner import router as app_cloner_router
from app.api.routes.audio_journal import router as audio_journal_router
from app.api.routes.audio import router as audio_router
from app.api.routes.health import router as health_router
from app.api.routes.settings import router as settings_router
from app.api.routes.stt import router as stt_router
from app.api.routes.tts import router as tts_router
from app.api.routes.transcripts import router as transcripts_router
from app.api.routes.voice import router as voice_router
from app.api.routes.voice_profiles import router as voice_profiles_router

api_router = APIRouter()
api_router.include_router(app_cloner_router)
api_router.include_router(audio_journal_router)
api_router.include_router(audio_router)
api_router.include_router(health_router)
api_router.include_router(settings_router)
api_router.include_router(voice_router)
api_router.include_router(voice_profiles_router)
api_router.include_router(stt_router)
api_router.include_router(tts_router)
api_router.include_router(transcripts_router)
