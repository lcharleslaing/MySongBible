from datetime import datetime

from pydantic import BaseModel, Field


class VoiceTriggerAliasRead(BaseModel):
    id: int
    trigger_id: int
    phrase: str
    normalized_phrase: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VoiceTriggerAssetRead(BaseModel):
    id: int
    managed_relative_path: str
    original_filename: str
    stored_filename: str
    mime_type: str
    file_size: int
    width: int | None
    height: int | None
    trigger_id: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VoiceTriggerCreate(BaseModel):
    primary_phrase: str = Field(min_length=1, max_length=255)
    aliases: list[str] = Field(default_factory=list)
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    content_json: dict | None = None
    category: str | None = Field(default=None, max_length=120)
    tags: list[str] = Field(default_factory=list)
    color: str | None = Field(default=None, max_length=32)
    match_mode: str = Field(default="whole_phrase", max_length=32)
    case_sensitive: bool = False
    strict_mode: bool = False
    enabled: bool = True
    duplicate_cooldown_seconds: float | None = Field(default=None, ge=0)
    settings_json: dict | None = None


class VoiceTriggerUpdate(BaseModel):
    primary_phrase: str | None = Field(default=None, min_length=1, max_length=255)
    aliases: list[str] | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    content_json: dict | None = None
    category: str | None = Field(default=None, max_length=120)
    tags: list[str] | None = None
    color: str | None = Field(default=None, max_length=32)
    match_mode: str | None = Field(default=None, max_length=32)
    case_sensitive: bool | None = None
    strict_mode: bool | None = None
    enabled: bool | None = None
    duplicate_cooldown_seconds: float | None = Field(default=None, ge=0)
    settings_json: dict | None = None


class VoiceTriggerRead(BaseModel):
    id: int
    primary_phrase: str
    normalized_phrase: str
    title: str
    description: str | None
    content_json: dict | None
    category: str | None
    tags_json: list[str]
    color: str | None
    match_mode: str
    case_sensitive: bool
    strict_mode: bool
    enabled: bool
    duplicate_cooldown_seconds: float | None
    image_asset_id: int | None
    settings_json: dict | None
    created_at: datetime
    updated_at: datetime
    aliases: list[VoiceTriggerAliasRead] = Field(default_factory=list)
    image_asset: VoiceTriggerAssetRead | None = None

    model_config = {"from_attributes": True}


class VoiceTriggerListResponse(BaseModel):
    items: list[VoiceTriggerRead]


class ListeningSessionCreate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    status: str = Field(default="draft", max_length=32)
    settings_json: dict = Field(default_factory=dict)


class ListeningSessionUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    status: str | None = Field(default=None, max_length=32)
    notes: str | None = None
    tags: list[str] | None = None
    settings_json: dict | None = None
    autosave_state_json: dict | None = None


class TranscriptSegmentCreate(BaseModel):
    text: str = Field(min_length=1)
    start_timestamp_ms: int | None = None
    end_timestamp_ms: int | None = None
    is_final: bool = True
    source: str = Field(default="manual", max_length=64)
    source_transcript_id: int | None = None
    insertion_block_id: int | None = None
    insertion_offset: int | None = Field(default=None, ge=0)


class SessionContentBlockUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    content: str | None = None
    status: str | None = Field(default=None, max_length=32)
    order_index: int | None = None
    metadata_json: dict | None = None


class ManualNoteCreate(BaseModel):
    block_type: str = Field(default="note", max_length=32)
    title: str | None = Field(default=None, max_length=255)
    content: str | None = None
    order_index: int | None = None
    metadata_json: dict = Field(default_factory=dict)


class ManualTriggerInsert(BaseModel):
    insertion_block_id: int | None = None
    insertion_offset: int | None = Field(default=None, ge=0)


class TriggerActivationEventRead(BaseModel):
    id: int
    session_id: int
    trigger_id: int | None
    alias_id: int | None
    transcript_segment_id: int | None
    order_index: int
    spoken_phrase: str
    matched_alias: str | None
    match_mode: str
    detected_at: datetime
    transcript_position_start: int | None
    transcript_position_end: int | None
    snapshot_title: str
    snapshot_content: str | None
    snapshot_image_asset_id: int | None
    snapshot_image_reference: str | None
    removed: bool
    metadata_json: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TranscriptSegmentRead(BaseModel):
    id: int
    session_id: int
    order_index: int
    text: str
    start_timestamp_ms: int | None
    end_timestamp_ms: int | None
    is_final: bool
    source: str
    source_transcript_id: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SessionContentBlockRead(BaseModel):
    id: int
    session_id: int
    order_index: int
    block_type: str
    status: str
    transcript_segment_id: int | None
    trigger_id: int | None
    activation_event_id: int | None
    title: str | None
    content: str | None
    image_asset_id: int | None
    image_reference: str | None
    metadata_json: dict
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ListeningSessionRead(BaseModel):
    id: int
    title: str
    status: str
    started_at: datetime | None
    stopped_at: datetime | None
    created_at: datetime
    updated_at: datetime
    last_saved_at: datetime | None
    duration_seconds: float | None
    current_order: int
    transcript_text: str | None
    notes: str | None
    tags_json: list[str]
    settings_json: dict
    autosave_state_json: dict
    segments: list[TranscriptSegmentRead] = Field(default_factory=list)
    blocks: list[SessionContentBlockRead] = Field(default_factory=list)
    activations: list[TriggerActivationEventRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class ListeningSessionListResponse(BaseModel):
    items: list[ListeningSessionRead]


class TranscriptAppendResponse(BaseModel):
    session: ListeningSessionRead
    segment: TranscriptSegmentRead
    activations: list[TriggerActivationEventRead]
    blocks: list[SessionContentBlockRead]


class TriggerImportPayload(BaseModel):
    version: int = 1
    triggers: list[VoiceTriggerCreate]


class TriggerImportResult(BaseModel):
    imported_count: int
    skipped_count: int
    conflict_count: int
    conflicts: list[str] = Field(default_factory=list)


class TriggerExportPayload(BaseModel):
    version: int = 1
    triggers: list[VoiceTriggerRead]
