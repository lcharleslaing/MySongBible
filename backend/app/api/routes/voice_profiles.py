from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.dependencies import get_session
from app.local_ai.voice_cloning.base import ReferenceAudioManager
from app.local_ai.voice_cloning.engines import F5TTSVoiceCloneEngine, XTTSVoiceCloneEngine
from app.schemas.voice_profiles import (
    VoiceEngineListResponse,
    VoiceEngineRead,
    VoiceProfileCreateRequest,
    VoiceProfileListResponse,
    VoiceProfileRead,
)
from app.services.voice_profiles import VoiceProfileService

router = APIRouter(tags=["voice-profiles"])


async def get_voice_profile_service(session: Session = Depends(get_session)) -> VoiceProfileService:
    return VoiceProfileService(session, ReferenceAudioManager())


@router.get("/voice-profiles", response_model=VoiceProfileListResponse)
async def list_voice_profiles(service: VoiceProfileService = Depends(get_voice_profile_service)) -> VoiceProfileListResponse:
    items = service.list_profiles()
    return VoiceProfileListResponse(items=[VoiceProfileRead.model_validate(item) for item in items])


@router.post("/voice-profiles", response_model=VoiceProfileRead, status_code=status.HTTP_201_CREATED)
async def create_voice_profile(
    payload: VoiceProfileCreateRequest,
    service: VoiceProfileService = Depends(get_voice_profile_service),
) -> VoiceProfileRead:
    try:
        profile = service.create_profile(payload)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    return VoiceProfileRead.model_validate(profile)


@router.get("/voice-engines", response_model=VoiceEngineListResponse)
async def list_voice_engines() -> VoiceEngineListResponse:
    items = [
        VoiceEngineRead(**XTTSVoiceCloneEngine().status().__dict__),
        VoiceEngineRead(**F5TTSVoiceCloneEngine().status().__dict__),
    ]
    return VoiceEngineListResponse(items=items)
