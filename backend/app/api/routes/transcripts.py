from fastapi import APIRouter, Depends, status
from sqlmodel import Session

from app.api.dependencies import get_session
from app.schemas.transcripts import TranscriptCreate, TranscriptListResponse, TranscriptRead
from app.services.transcripts import TranscriptService

router = APIRouter(tags=["transcripts"])


@router.get("/transcripts", response_model=TranscriptListResponse)
async def list_transcripts(session: Session = Depends(get_session)) -> TranscriptListResponse:
    transcripts = TranscriptService(session).list_transcripts()
    return TranscriptListResponse(items=[TranscriptRead.model_validate(item) for item in transcripts])


@router.post("/transcripts", response_model=TranscriptRead, status_code=status.HTTP_201_CREATED)
async def create_transcript(
    payload: TranscriptCreate,
    session: Session = Depends(get_session),
) -> TranscriptRead:
    transcript = TranscriptService(session).create_transcript(payload)
    return TranscriptRead.model_validate(transcript)
