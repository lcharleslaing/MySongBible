from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlmodel import Session

from app.api.dependencies import get_app_settings, get_session, get_settings_service
from app.core.config import Settings
from app.local_ai.stt.whisper_cpp import WhisperCppError, WhisperCppTranscriber
from app.schemas.audio_journal import (
    AudioJournalEntryCreate,
    AudioJournalEntryRead,
    AudioJournalEntryUpdate,
    AudioJournalListResponse,
    AudioJournalRecordingAtmosphere,
    AudioJournalTakeCreate,
    AudioJournalTakeRead,
    AudioJournalTakeUpdate,
    AudioJournalTrainingCandidateUpdate,
    AudioJournalUploadResponse,
)
from app.services.audio_journal import AudioJournalError, AudioJournalService
from app.services.settings import SettingsService
from app.services.stt import SttUploadError

router = APIRouter(tags=["audio-journal"])

MEDIA_TYPES_BY_EXTENSION = {
    ".wav": "audio/wav",
    ".mp3": "audio/mpeg",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".webm": "audio/webm",
}


def serialize_entry(service: AudioJournalService, entry_id: int) -> AudioJournalEntryRead:
    entry = service.get_entry(entry_id)
    payload = AudioJournalEntryRead.model_validate(entry)
    payload.takes = [AudioJournalTakeRead.model_validate(take) for take in service.list_takes_without_entry_check(entry_id)]
    return payload


async def get_audio_journal_service(
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_app_settings),
) -> AudioJournalService:
    return AudioJournalService(session=session, settings=settings)


async def get_audio_journal_transcription_service(
    session: Session = Depends(get_session),
    settings_service: SettingsService = Depends(get_settings_service),
) -> AudioJournalService:
    runtime_settings = settings_service.get_runtime_settings()
    return AudioJournalService(
        session=session,
        settings=runtime_settings,
        transcriber=WhisperCppTranscriber(runtime_settings),
    )


def handle_audio_journal_error(error: AudioJournalError | SttUploadError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=error.message)


def handle_whisper_error(error: WhisperCppError) -> HTTPException:
    return HTTPException(
        status_code=error.status_code,
        detail={
            "message": error.message,
            "stdout": error.stdout,
            "stderr": error.stderr,
        },
    )


@router.get("/audio-journal", response_model=AudioJournalListResponse)
async def list_audio_journal_entries(
    service: AudioJournalService = Depends(get_audio_journal_service),
) -> AudioJournalListResponse:
    return AudioJournalListResponse(
        items=[serialize_entry(service, entry.id or 0) for entry in service.list_entries()],
    )


@router.get("/audio-journal/recording-atmosphere", response_model=AudioJournalRecordingAtmosphere | None)
async def get_audio_journal_recording_atmosphere(
    service: AudioJournalService = Depends(get_audio_journal_service),
) -> AudioJournalRecordingAtmosphere | None:
    return service.get_recording_atmosphere()


@router.get("/audio-journal/{entry_id}", response_model=AudioJournalEntryRead)
async def get_audio_journal_entry(
    entry_id: int,
    service: AudioJournalService = Depends(get_audio_journal_service),
) -> AudioJournalEntryRead:
    try:
        return serialize_entry(service, entry_id)
    except AudioJournalError as error:
        raise handle_audio_journal_error(error) from error


@router.post("/audio-journal", response_model=AudioJournalUploadResponse, status_code=status.HTTP_201_CREATED)
async def create_audio_journal_entry(
    audio_file: UploadFile = File(...),
    title: str | None = Form(default=None),
    voice_style: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    tags_json: str | None = Form(default=None),
    script_text: str | None = Form(default=None),
    service: AudioJournalService = Depends(get_audio_journal_service),
) -> AudioJournalUploadResponse:
    try:
        entry, take = service.create_entry_with_upload(
            audio_file=audio_file,
            payload=AudioJournalEntryCreate(
                title=title,
                script_text=script_text,
                notes=notes,
                tags_json=tags_json,
                voice_style=voice_style,
            ),
        )
        return AudioJournalUploadResponse(
            entry=serialize_entry(service, entry.id or 0),
            take=AudioJournalTakeRead.model_validate(take),
        )
    except (AudioJournalError, SttUploadError) as error:
        raise handle_audio_journal_error(error) from error


@router.patch("/audio-journal/{entry_id}", response_model=AudioJournalEntryRead)
async def update_audio_journal_entry(
    entry_id: int,
    payload: AudioJournalEntryUpdate,
    service: AudioJournalService = Depends(get_audio_journal_service),
) -> AudioJournalEntryRead:
    try:
        entry = service.update_entry(entry_id, payload)
        return serialize_entry(service, entry.id or 0)
    except AudioJournalError as error:
        raise handle_audio_journal_error(error) from error


@router.delete("/audio-journal/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_audio_journal_entry(
    entry_id: int,
    delete_audio: bool = False,
    service: AudioJournalService = Depends(get_audio_journal_service),
) -> Response:
    try:
        service.delete_entry(entry_id, delete_audio=delete_audio)
    except AudioJournalError as error:
        raise handle_audio_journal_error(error) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/audio-journal/{entry_id}/takes", response_model=list[AudioJournalTakeRead])
async def list_audio_journal_takes(
    entry_id: int,
    service: AudioJournalService = Depends(get_audio_journal_service),
) -> list[AudioJournalTakeRead]:
    try:
        return [AudioJournalTakeRead.model_validate(take) for take in service.list_takes(entry_id)]
    except AudioJournalError as error:
        raise handle_audio_journal_error(error) from error


@router.post("/audio-journal/{entry_id}/takes", response_model=AudioJournalTakeRead, status_code=status.HTTP_201_CREATED)
async def create_audio_journal_take(
    entry_id: int,
    audio_file: UploadFile = File(...),
    take_type: str = Form(default="import"),
    transcript_source: str = Form(default="unknown"),
    transcript_text: str | None = Form(default=None),
    service: AudioJournalService = Depends(get_audio_journal_service),
) -> AudioJournalTakeRead:
    try:
        take = service.create_take(
            entry_id,
            audio_file=audio_file,
            payload=AudioJournalTakeCreate(
                take_type=take_type,
                transcript_text=transcript_text,
                transcript_source=transcript_source,
            ),
        )
        return AudioJournalTakeRead.model_validate(take)
    except (AudioJournalError, SttUploadError) as error:
        raise handle_audio_journal_error(error) from error


@router.get("/audio-journal/{entry_id}/takes/{take_id}", response_model=AudioJournalTakeRead)
async def get_audio_journal_take(
    entry_id: int,
    take_id: int,
    service: AudioJournalService = Depends(get_audio_journal_service),
) -> AudioJournalTakeRead:
    try:
        return AudioJournalTakeRead.model_validate(service.get_take(entry_id, take_id))
    except AudioJournalError as error:
        raise handle_audio_journal_error(error) from error


@router.patch("/audio-journal/{entry_id}/takes/{take_id}", response_model=AudioJournalTakeRead)
async def update_audio_journal_take(
    entry_id: int,
    take_id: int,
    payload: AudioJournalTakeUpdate,
    service: AudioJournalService = Depends(get_audio_journal_service),
) -> AudioJournalTakeRead:
    try:
        return AudioJournalTakeRead.model_validate(service.update_take(entry_id, take_id, payload))
    except AudioJournalError as error:
        raise handle_audio_journal_error(error) from error


@router.delete("/audio-journal/{entry_id}/takes/{take_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_audio_journal_take(
    entry_id: int,
    take_id: int,
    delete_audio: bool = False,
    service: AudioJournalService = Depends(get_audio_journal_service),
) -> Response:
    try:
        service.delete_take(entry_id, take_id, delete_audio=delete_audio)
    except AudioJournalError as error:
        raise handle_audio_journal_error(error) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/audio-journal/{entry_id}/takes/{take_id}/analyze-quality", response_model=AudioJournalTakeRead)
async def analyze_audio_journal_take_quality(
    entry_id: int,
    take_id: int,
    service: AudioJournalService = Depends(get_audio_journal_service),
) -> AudioJournalTakeRead:
    try:
        return AudioJournalTakeRead.model_validate(service.analyze_take_quality(entry_id, take_id))
    except AudioJournalError as error:
        raise handle_audio_journal_error(error) from error


@router.post(
    "/audio-journal/{entry_id}/takes/{take_id}/recording-atmosphere",
    response_model=AudioJournalRecordingAtmosphere,
)
async def set_audio_journal_recording_atmosphere(
    entry_id: int,
    take_id: int,
    service: AudioJournalService = Depends(get_audio_journal_service),
) -> AudioJournalRecordingAtmosphere:
    try:
        return service.set_recording_atmosphere_from_take(entry_id, take_id)
    except AudioJournalError as error:
        raise handle_audio_journal_error(error) from error


@router.post("/audio-journal/{entry_id}/takes/{take_id}/transcribe", response_model=AudioJournalUploadResponse)
async def transcribe_audio_journal_take(
    entry_id: int,
    take_id: int,
    language: str | None = None,
    service: AudioJournalService = Depends(get_audio_journal_transcription_service),
) -> AudioJournalUploadResponse:
    try:
        take = service.transcribe_take(entry_id, take_id, language=language)
        return AudioJournalUploadResponse(
            entry=serialize_entry(service, entry_id),
            take=AudioJournalTakeRead.model_validate(take),
        )
    except AudioJournalError as error:
        raise handle_audio_journal_error(error) from error
    except SttUploadError as error:
        raise handle_audio_journal_error(error) from error
    except WhisperCppError as error:
        raise handle_whisper_error(error) from error


@router.post("/audio-journal/{entry_id}/takes/{take_id}/set-active", response_model=AudioJournalTakeRead)
async def set_audio_journal_active_take(
    entry_id: int,
    take_id: int,
    service: AudioJournalService = Depends(get_audio_journal_service),
) -> AudioJournalTakeRead:
    try:
        return AudioJournalTakeRead.model_validate(service.set_active_take(entry_id, take_id))
    except AudioJournalError as error:
        raise handle_audio_journal_error(error) from error


@router.patch("/audio-journal/{entry_id}/takes/{take_id}/training-candidate", response_model=AudioJournalTakeRead)
async def update_audio_journal_training_candidate(
    entry_id: int,
    take_id: int,
    payload: AudioJournalTrainingCandidateUpdate,
    service: AudioJournalService = Depends(get_audio_journal_service),
) -> AudioJournalTakeRead:
    try:
        return AudioJournalTakeRead.model_validate(service.update_training_candidate(entry_id, take_id, payload))
    except AudioJournalError as error:
        raise handle_audio_journal_error(error) from error


@router.get("/audio-journal/{entry_id}/takes/{take_id}/audio")
async def get_audio_journal_take_audio(
    entry_id: int,
    take_id: int,
    service: AudioJournalService = Depends(get_audio_journal_service),
) -> FileResponse:
    try:
        audio_path = service.audio_path_for_take(entry_id, take_id)
    except AudioJournalError as error:
        raise handle_audio_journal_error(error) from error
    return FileResponse(
        path=audio_path,
        media_type=MEDIA_TYPES_BY_EXTENSION.get(Path(audio_path).suffix.lower(), "application/octet-stream"),
        filename=Path(audio_path).name,
        content_disposition_type="inline",
    )
