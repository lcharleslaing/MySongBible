from datetime import datetime

from pydantic import BaseModel, Field


class AudioQualityMetrics(BaseModel):
    duration_seconds: float | None = None
    sample_rate: int | None = None
    channels: int | None = None
    file_format: str | None = None
    quality_status: str = "unknown"
    quality_score: float | None = None
    quality_summary: str | None = None
    quality_reasons_json: str | None = None
    noise_floor_db: float | None = None
    rms_db: float | None = None
    peak_db: float | None = None
    clipping_detected: bool = False
    silence_ratio: float | None = None
    snr_estimate_db: float | None = None


class AudioJournalRecordingAtmosphere(BaseModel):
    captured_at: datetime
    entry_id: int
    take_id: int
    take_number: int
    audio_filename: str
    duration_seconds: float | None = None
    sample_rate: int | None = None
    channels: int | None = None
    file_format: str | None = None
    quality_score: float | None = None
    noise_floor_db: float | None = None
    rms_db: float | None = None
    peak_db: float | None = None
    silence_ratio: float | None = None
    snr_estimate_db: float | None = None


class AudioJournalEntryCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    journal_date: datetime | None = None
    script_text: str | None = None
    notes: str | None = None
    tags_json: str | None = None
    voice_style: str | None = Field(default=None, max_length=100)
    metadata_json: str | None = None


class AudioJournalEntryUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    journal_date: datetime | None = None
    script_text: str | None = None
    original_transcript_text: str | None = None
    notes: str | None = None
    tags_json: str | None = None
    voice_style: str | None = Field(default=None, max_length=100)
    active_take_id: int | None = None
    selected_training_take_id: int | None = None
    overall_quality_status: str | None = Field(default=None, max_length=32)
    metadata_json: str | None = None


class AudioJournalTakeCreate(BaseModel):
    take_type: str = Field(default="original", max_length=32)
    transcript_text: str | None = None
    transcript_source: str = Field(default="unknown", max_length=32)
    metadata_json: str | None = None


class AudioJournalTakeUpdate(BaseModel):
    transcript_text: str | None = None
    transcript_source: str | None = Field(default=None, max_length=32)
    transcription_status: str | None = Field(default=None, max_length=32)
    transcription_engine: str | None = Field(default=None, max_length=100)
    transcription_model: str | None = Field(default=None, max_length=255)
    quality_status: str | None = Field(default=None, max_length=32)
    quality_score: float | None = None
    quality_summary: str | None = None
    quality_reasons_json: str | None = None
    is_training_candidate: bool | None = None
    training_quality: str | None = Field(default=None, max_length=32)
    script_match_score: float | None = None
    metadata_json: str | None = None


class AudioJournalTrainingCandidateUpdate(BaseModel):
    is_training_candidate: bool
    manual_override: bool = False
    reason: str | None = None


class AudioJournalTakeRead(BaseModel):
    id: int
    entry_id: int
    take_number: int
    take_type: str
    created_at: datetime
    audio_path: str
    audio_filename: str
    transcript_text: str | None
    transcript_source: str
    transcription_status: str
    transcription_engine: str | None
    transcription_model: str | None
    duration_seconds: float | None
    sample_rate: int | None
    channels: int | None
    file_format: str | None
    quality_status: str
    quality_score: float | None
    quality_summary: str | None
    quality_reasons_json: str | None
    noise_floor_db: float | None
    rms_db: float | None
    peak_db: float | None
    clipping_detected: bool
    silence_ratio: float | None
    snr_estimate_db: float | None
    is_active: bool
    is_training_candidate: bool
    training_quality: str | None
    script_match_score: float | None
    metadata_json: str | None

    model_config = {"from_attributes": True}


class AudioJournalEntryRead(BaseModel):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime
    journal_date: datetime
    script_text: str | None
    original_transcript_text: str | None
    notes: str | None
    tags_json: str | None
    voice_style: str | None
    active_take_id: int | None
    selected_training_take_id: int | None
    overall_quality_status: str
    metadata_json: str | None
    takes: list[AudioJournalTakeRead] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class AudioJournalUploadResponse(BaseModel):
    entry: AudioJournalEntryRead
    take: AudioJournalTakeRead


class AudioJournalListResponse(BaseModel):
    items: list[AudioJournalEntryRead]
