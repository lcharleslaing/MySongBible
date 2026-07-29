from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, Response
from sqlmodel import Session

from app.api.dependencies import get_app_settings, get_session
from app.core.config import Settings
from app.schemas.voice_triggered_content import (
    ListeningSessionCreate,
    ListeningSessionListResponse,
    ListeningSessionRead,
    ListeningSessionUpdate,
    ManualNoteCreate,
    SessionContentBlockRead,
    SessionContentBlockUpdate,
    TranscriptAppendResponse,
    TranscriptSegmentCreate,
    TranscriptSegmentRead,
    TriggerActivationEventRead,
    TriggerExportPayload,
    TriggerImportPayload,
    TriggerImportResult,
    VoiceTriggerAliasRead,
    VoiceTriggerAssetRead,
    VoiceTriggerCreate,
    VoiceTriggerListResponse,
    VoiceTriggerRead,
    VoiceTriggerUpdate,
)
from app.services.voice_triggered_content import VoiceTriggeredContentError, VoiceTriggeredContentService

router = APIRouter(prefix="/listen-commands", tags=["listen-commands"])


async def get_service(
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_app_settings),
) -> VoiceTriggeredContentService:
    return VoiceTriggeredContentService(session=session, settings=settings)


def handle_error(error: VoiceTriggeredContentError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=error.message)


def serialize_trigger(service: VoiceTriggeredContentService, trigger_id: int) -> VoiceTriggerRead:
    trigger = service.get_trigger(trigger_id)
    payload = VoiceTriggerRead.model_validate(trigger)
    payload.aliases = [VoiceTriggerAliasRead.model_validate(alias) for alias in service.list_aliases(trigger_id)]
    asset = service.get_asset(trigger.image_asset_id)
    payload.image_asset = VoiceTriggerAssetRead.model_validate(asset) if asset else None
    return payload


def serialize_session(service: VoiceTriggeredContentService, session_id: int) -> ListeningSessionRead:
    item = service.get_session_record(session_id)
    payload = ListeningSessionRead.model_validate(item)
    payload.segments = [TranscriptSegmentRead.model_validate(segment) for segment in service.list_segments(session_id)]
    payload.blocks = [SessionContentBlockRead.model_validate(block) for block in service.list_blocks(session_id)]
    payload.activations = [TriggerActivationEventRead.model_validate(event) for event in service.list_activations(session_id)]
    return payload


@router.get("/triggers", response_model=VoiceTriggerListResponse)
async def list_triggers(
    query: str | None = None,
    service: VoiceTriggeredContentService = Depends(get_service),
) -> VoiceTriggerListResponse:
    return VoiceTriggerListResponse(items=[serialize_trigger(service, trigger.id or 0) for trigger in service.list_triggers(query)])


@router.post("/triggers", response_model=VoiceTriggerRead, status_code=status.HTTP_201_CREATED)
async def create_trigger(
    payload: VoiceTriggerCreate,
    service: VoiceTriggeredContentService = Depends(get_service),
) -> VoiceTriggerRead:
    try:
        trigger = service.create_trigger(payload)
        return serialize_trigger(service, trigger.id or 0)
    except VoiceTriggeredContentError as error:
        raise handle_error(error) from error


@router.get("/triggers/{trigger_id}", response_model=VoiceTriggerRead)
async def get_trigger(
    trigger_id: int,
    service: VoiceTriggeredContentService = Depends(get_service),
) -> VoiceTriggerRead:
    try:
        return serialize_trigger(service, trigger_id)
    except VoiceTriggeredContentError as error:
        raise handle_error(error) from error


@router.patch("/triggers/{trigger_id}", response_model=VoiceTriggerRead)
async def update_trigger(
    trigger_id: int,
    payload: VoiceTriggerUpdate,
    service: VoiceTriggeredContentService = Depends(get_service),
) -> VoiceTriggerRead:
    try:
        trigger = service.update_trigger(trigger_id, payload)
        return serialize_trigger(service, trigger.id or 0)
    except VoiceTriggeredContentError as error:
        raise handle_error(error) from error


@router.post("/triggers/{trigger_id}/duplicate", response_model=VoiceTriggerRead, status_code=status.HTTP_201_CREATED)
async def duplicate_trigger(
    trigger_id: int,
    service: VoiceTriggeredContentService = Depends(get_service),
) -> VoiceTriggerRead:
    try:
        trigger = service.duplicate_trigger(trigger_id)
        return serialize_trigger(service, trigger.id or 0)
    except VoiceTriggeredContentError as error:
        raise handle_error(error) from error


@router.delete("/triggers/{trigger_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trigger(
    trigger_id: int,
    service: VoiceTriggeredContentService = Depends(get_service),
) -> Response:
    try:
        service.delete_trigger(trigger_id)
    except VoiceTriggeredContentError as error:
        raise handle_error(error) from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/triggers/{trigger_id}/image", response_model=VoiceTriggerAssetRead, status_code=status.HTTP_201_CREATED)
async def upload_trigger_image(
    trigger_id: int,
    image_file: UploadFile = File(...),
    service: VoiceTriggeredContentService = Depends(get_service),
) -> VoiceTriggerAssetRead:
    try:
        return VoiceTriggerAssetRead.model_validate(service.store_trigger_image(trigger_id, image_file))
    except VoiceTriggeredContentError as error:
        raise handle_error(error) from error


@router.get("/assets/{asset_id}")
async def get_asset(
    asset_id: int,
    service: VoiceTriggeredContentService = Depends(get_service),
) -> FileResponse:
    try:
        path, mime_type = service.asset_path(asset_id)
    except VoiceTriggeredContentError as error:
        raise handle_error(error) from error
    return FileResponse(path=path, media_type=mime_type, filename=path.name, content_disposition_type="inline")


@router.get("/sessions", response_model=ListeningSessionListResponse)
async def list_sessions(
    include_deleted: bool = False,
    service: VoiceTriggeredContentService = Depends(get_service),
) -> ListeningSessionListResponse:
    return ListeningSessionListResponse(items=[serialize_session(service, item.id or 0) for item in service.list_sessions(include_deleted)])


@router.get("/sessions/incomplete", response_model=ListeningSessionListResponse)
async def list_incomplete_sessions(
    service: VoiceTriggeredContentService = Depends(get_service),
) -> ListeningSessionListResponse:
    return ListeningSessionListResponse(items=[serialize_session(service, item.id or 0) for item in service.incomplete_sessions()])


@router.post("/sessions", response_model=ListeningSessionRead, status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: ListeningSessionCreate,
    service: VoiceTriggeredContentService = Depends(get_service),
) -> ListeningSessionRead:
    return serialize_session(service, service.create_session(payload).id or 0)


@router.get("/sessions/{session_id}", response_model=ListeningSessionRead)
async def get_session_record(
    session_id: int,
    service: VoiceTriggeredContentService = Depends(get_service),
) -> ListeningSessionRead:
    try:
        return serialize_session(service, session_id)
    except VoiceTriggeredContentError as error:
        raise handle_error(error) from error


@router.patch("/sessions/{session_id}", response_model=ListeningSessionRead)
async def update_session(
    session_id: int,
    payload: ListeningSessionUpdate,
    service: VoiceTriggeredContentService = Depends(get_service),
) -> ListeningSessionRead:
    try:
        return serialize_session(service, service.update_session(session_id, payload).id or 0)
    except VoiceTriggeredContentError as error:
        raise handle_error(error) from error


@router.post("/sessions/{session_id}/segments", response_model=TranscriptAppendResponse, status_code=status.HTTP_201_CREATED)
async def append_segment(
    session_id: int,
    payload: TranscriptSegmentCreate,
    service: VoiceTriggeredContentService = Depends(get_service),
) -> TranscriptAppendResponse:
    try:
        item, segment, activations, blocks = service.append_transcript_segment(session_id, payload)
    except VoiceTriggeredContentError as error:
        raise handle_error(error) from error
    return TranscriptAppendResponse(
        session=serialize_session(service, item.id or 0),
        segment=TranscriptSegmentRead.model_validate(segment),
        activations=[TriggerActivationEventRead.model_validate(activation) for activation in activations],
        blocks=[SessionContentBlockRead.model_validate(block) for block in blocks],
    )


@router.post("/sessions/{session_id}/blocks", response_model=SessionContentBlockRead, status_code=status.HTTP_201_CREATED)
async def add_manual_block(
    session_id: int,
    payload: ManualNoteCreate,
    service: VoiceTriggeredContentService = Depends(get_service),
) -> SessionContentBlockRead:
    try:
        return SessionContentBlockRead.model_validate(service.add_manual_block(session_id, payload))
    except VoiceTriggeredContentError as error:
        raise handle_error(error) from error


@router.patch("/blocks/{block_id}", response_model=SessionContentBlockRead)
async def update_block(
    block_id: int,
    payload: SessionContentBlockUpdate,
    service: VoiceTriggeredContentService = Depends(get_service),
) -> SessionContentBlockRead:
    try:
        return SessionContentBlockRead.model_validate(service.update_block(block_id, payload))
    except VoiceTriggeredContentError as error:
        raise handle_error(error) from error


@router.post("/sessions/{session_id}/triggers/{trigger_id}", response_model=TriggerActivationEventRead, status_code=status.HTTP_201_CREATED)
async def manually_insert_trigger(
    session_id: int,
    trigger_id: int,
    service: VoiceTriggeredContentService = Depends(get_service),
) -> TriggerActivationEventRead:
    try:
        activation, _block = service.manual_insert_trigger(session_id, trigger_id)
        return TriggerActivationEventRead.model_validate(activation)
    except VoiceTriggeredContentError as error:
        raise handle_error(error) from error


@router.get("/triggers-export", response_model=TriggerExportPayload)
async def export_triggers(
    service: VoiceTriggeredContentService = Depends(get_service),
) -> TriggerExportPayload:
    return TriggerExportPayload(triggers=[serialize_trigger(service, trigger.id or 0) for trigger in service.list_triggers()])


@router.post("/triggers-import", response_model=TriggerImportResult)
async def import_triggers(
    payload: TriggerImportPayload,
    service: VoiceTriggeredContentService = Depends(get_service),
) -> TriggerImportResult:
    return service.import_triggers(payload)
