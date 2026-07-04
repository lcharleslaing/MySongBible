from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session

from app.api.dependencies import get_session, get_tts_engine_manager
from app.local_ai.tts.base import TtsEngineError
from app.local_ai.tts.manager import TtsEngineManager
from app.schemas.tts import TtsSynthesisRequest, TtsSynthesisResponse
from app.services.tts import TtsService

router = APIRouter(tags=["tts"])


@router.post("/tts/synthesize", response_model=TtsSynthesisResponse, status_code=status.HTTP_201_CREATED)
def synthesize_speech(
    payload: TtsSynthesisRequest,
    session: Session = Depends(get_session),
    manager: TtsEngineManager = Depends(get_tts_engine_manager),
) -> TtsSynthesisResponse:
    try:
        return TtsService(session, manager).synthesize(payload)
    except TtsEngineError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail={
                "message": error.message,
                "stdout": error.stdout,
                "stderr": error.stderr,
            },
        ) from error
