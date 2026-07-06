from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AudioJournalEntry(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str = Field(max_length=200)
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    updated_at: datetime = Field(default_factory=utc_now, nullable=False)
    journal_date: datetime = Field(default_factory=utc_now, nullable=False)
    script_text: str | None = None
    original_transcript_text: str | None = None
    notes: str | None = None
    tags_json: str | None = None
    voice_style: str | None = Field(default=None, max_length=100)
    active_take_id: int | None = Field(default=None, foreign_key="audiojournaltake.id")
    selected_training_take_id: int | None = Field(default=None, foreign_key="audiojournaltake.id")
    overall_quality_status: str = Field(default="unknown", max_length=32)
    metadata_json: str | None = None


class AudioJournalTake(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    entry_id: int = Field(foreign_key="audiojournalentry.id", index=True)
    take_number: int = Field(index=True)
    take_type: str = Field(default="original", max_length=32)
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    audio_path: str = Field(max_length=500)
    audio_filename: str = Field(max_length=255)
    transcript_text: str | None = None
    transcript_source: str = Field(default="unknown", max_length=32)
    transcription_status: str = Field(default="pending", max_length=32)
    transcription_engine: str | None = Field(default=None, max_length=100)
    transcription_model: str | None = Field(default=None, max_length=255)
    duration_seconds: float | None = None
    sample_rate: int | None = None
    channels: int | None = None
    file_format: str | None = Field(default=None, max_length=32)
    quality_status: str = Field(default="unknown", max_length=32)
    quality_score: float | None = None
    quality_summary: str | None = None
    quality_reasons_json: str | None = None
    noise_floor_db: float | None = None
    rms_db: float | None = None
    peak_db: float | None = None
    clipping_detected: bool = False
    silence_ratio: float | None = None
    snr_estimate_db: float | None = None
    is_active: bool = False
    is_training_candidate: bool = False
    training_quality: str | None = Field(default=None, max_length=32)
    script_match_score: float | None = None
    metadata_json: str | None = None
