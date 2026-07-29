from datetime import datetime, timezone
from typing import ClassVar

from sqlalchemy import Column, UniqueConstraint
from sqlalchemy.types import JSON
from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class VoiceTriggerDefinition(SQLModel, table=True):
    __tablename__: ClassVar[str] = "trigger_definitions"
    __table_args__: ClassVar[tuple] = (
        UniqueConstraint("normalized_phrase", name="uq_trigger_definitions_normalized_phrase"),
    )

    id: int | None = Field(default=None, primary_key=True)
    primary_phrase: str = Field(max_length=255, index=True)
    normalized_phrase: str = Field(max_length=255, index=True)
    title: str = Field(max_length=255)
    description: str | None = None
    content_json: dict | None = Field(default=None, sa_column=Column(JSON))
    category: str | None = Field(default=None, max_length=120, index=True)
    tags_json: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    color: str | None = Field(default=None, max_length=32)
    match_mode: str = Field(default="whole_phrase", max_length=32, index=True)
    case_sensitive: bool = False
    strict_mode: bool = False
    enabled: bool = Field(default=True, index=True)
    duplicate_cooldown_seconds: float | None = None
    image_asset_id: int | None = Field(default=None, foreign_key="trigger_assets.id")
    settings_json: dict | None = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    updated_at: datetime = Field(default_factory=utc_now, nullable=False)


class VoiceTriggerAlias(SQLModel, table=True):
    __tablename__: ClassVar[str] = "trigger_aliases"
    __table_args__: ClassVar[tuple] = (
        UniqueConstraint("normalized_phrase", name="uq_trigger_aliases_normalized_phrase"),
    )

    id: int | None = Field(default=None, primary_key=True)
    trigger_id: int = Field(foreign_key="trigger_definitions.id", index=True)
    phrase: str = Field(max_length=255, index=True)
    normalized_phrase: str = Field(max_length=255, index=True)
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    updated_at: datetime = Field(default_factory=utc_now, nullable=False)


class VoiceTriggerAsset(SQLModel, table=True):
    __tablename__: ClassVar[str] = "trigger_assets"

    id: int | None = Field(default=None, primary_key=True)
    managed_relative_path: str = Field(max_length=500, index=True)
    original_filename: str = Field(max_length=255)
    stored_filename: str = Field(max_length=255)
    mime_type: str = Field(max_length=120)
    file_size: int
    width: int | None = None
    height: int | None = None
    trigger_id: int | None = Field(default=None, foreign_key="trigger_definitions.id", index=True)
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    updated_at: datetime = Field(default_factory=utc_now, nullable=False)


class ListeningSession(SQLModel, table=True):
    __tablename__: ClassVar[str] = "listening_sessions"

    id: int | None = Field(default=None, primary_key=True)
    title: str = Field(max_length=255, index=True)
    status: str = Field(default="draft", max_length=32, index=True)
    started_at: datetime | None = Field(default=None, index=True)
    stopped_at: datetime | None = None
    created_at: datetime = Field(default_factory=utc_now, nullable=False, index=True)
    updated_at: datetime = Field(default_factory=utc_now, nullable=False)
    last_saved_at: datetime | None = None
    duration_seconds: float | None = None
    current_order: int = Field(default=0, nullable=False)
    transcript_text: str | None = None
    notes: str | None = None
    tags_json: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    settings_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    autosave_state_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))


class TranscriptSegment(SQLModel, table=True):
    __tablename__: ClassVar[str] = "transcript_segments"

    id: int | None = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="listening_sessions.id", index=True)
    order_index: int = Field(index=True)
    text: str
    start_timestamp_ms: int | None = Field(default=None, index=True)
    end_timestamp_ms: int | None = None
    is_final: bool = Field(default=True, index=True)
    source: str = Field(default="manual", max_length=64)
    source_transcript_id: int | None = Field(default=None, foreign_key="transcript.id")
    created_at: datetime = Field(default_factory=utc_now, nullable=False, index=True)
    updated_at: datetime = Field(default_factory=utc_now, nullable=False)


class SessionContentBlock(SQLModel, table=True):
    __tablename__: ClassVar[str] = "session_content_blocks"

    id: int | None = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="listening_sessions.id", index=True)
    order_index: int = Field(index=True)
    block_type: str = Field(max_length=32, index=True)
    status: str = Field(default="active", max_length=32, index=True)
    transcript_segment_id: int | None = Field(default=None, foreign_key="transcript_segments.id")
    trigger_id: int | None = Field(default=None, foreign_key="trigger_definitions.id", index=True)
    activation_event_id: int | None = Field(default=None, foreign_key="trigger_activation_events.id", index=True)
    title: str | None = Field(default=None, max_length=255)
    content: str | None = None
    image_asset_id: int | None = Field(default=None, foreign_key="trigger_assets.id")
    image_reference: str | None = Field(default=None, max_length=500)
    metadata_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    updated_at: datetime = Field(default_factory=utc_now, nullable=False)


class TriggerActivationEvent(SQLModel, table=True):
    __tablename__: ClassVar[str] = "trigger_activation_events"

    id: int | None = Field(default=None, primary_key=True)
    session_id: int = Field(foreign_key="listening_sessions.id", index=True)
    trigger_id: int | None = Field(default=None, foreign_key="trigger_definitions.id", index=True)
    alias_id: int | None = Field(default=None, foreign_key="trigger_aliases.id", index=True)
    transcript_segment_id: int | None = Field(default=None, foreign_key="transcript_segments.id", index=True)
    order_index: int = Field(index=True)
    spoken_phrase: str = Field(max_length=255, index=True)
    matched_alias: str | None = Field(default=None, max_length=255, index=True)
    match_mode: str = Field(max_length=32, index=True)
    detected_at: datetime = Field(default_factory=utc_now, nullable=False, index=True)
    transcript_position_start: int | None = None
    transcript_position_end: int | None = None
    snapshot_title: str = Field(max_length=255)
    snapshot_content: str | None = None
    snapshot_image_asset_id: int | None = Field(default=None, foreign_key="trigger_assets.id")
    snapshot_image_reference: str | None = Field(default=None, max_length=500)
    removed: bool = Field(default=False, index=True)
    metadata_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    updated_at: datetime = Field(default_factory=utc_now, nullable=False)


class VoiceTriggerPreference(SQLModel, table=True):
    __tablename__: ClassVar[str] = "voice_trigger_preferences"
    __table_args__: ClassVar[tuple] = (
        UniqueConstraint("key", name="uq_voice_trigger_preferences_key"),
    )

    id: int | None = Field(default=None, primary_key=True)
    key: str = Field(max_length=120, index=True)
    value_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    updated_at: datetime = Field(default_factory=utc_now, nullable=False)


class VoiceTriggerImportHistory(SQLModel, table=True):
    __tablename__: ClassVar[str] = "voice_trigger_import_history"

    id: int | None = Field(default=None, primary_key=True)
    source_filename: str | None = Field(default=None, max_length=255)
    imported_count: int = 0
    skipped_count: int = 0
    conflict_count: int = 0
    status: str = Field(default="completed", max_length=32, index=True)
    details_json: dict = Field(default_factory=dict, sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=utc_now, nullable=False, index=True)
    updated_at: datetime = Field(default_factory=utc_now, nullable=False)
