from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlmodel import Session

from app.api.dependencies import get_app_settings, get_session, get_whisper_cpp_transcriber
from app.core.config import Settings
from app.local_ai.stt.whisper_cpp import WhisperCppError, WhisperCppTranscriber
from app.schemas.transcripts import TranscriptRead
from app.services.stt import SttService, SttUploadError

router = APIRouter(tags=["stt"])


@router.post("/stt/transcribe", response_model=TranscriptRead, status_code=status.HTTP_201_CREATED)
async def transcribe_audio(
    audio_file: UploadFile = File(...),
    title: str | None = Form(default=None),
    language: str | None = Form(default=None),
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_app_settings),
    transcriber: WhisperCppTranscriber = Depends(get_whisper_cpp_transcriber),
) -> TranscriptRead:
    try:
        transcript = SttService(
            session=session,
            settings=settings,
            transcriber=transcriber,
        ).transcribe_upload(
            upload_file=audio_file,
            title=title,
            language=language,
        )
    except WhisperCppError as error:
        raise HTTPException(
            status_code=error.status_code,
            detail={
                "message": error.message,
                "stdout": error.stdout,
                "stderr": error.stderr,
            },
        ) from error
    except SttUploadError as error:
        raise HTTPException(status_code=error.status_code, detail=error.message) from error

    return TranscriptRead.model_validate(transcript)
