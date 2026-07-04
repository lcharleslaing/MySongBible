from datetime import datetime

from pydantic import BaseModel, Field


class TranscriptCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    transcript_text: str = Field(min_length=1)
    source_audio_path: str | None = Field(default=None, max_length=500)
    source_audio_name: str | None = Field(default=None, max_length=255)
    language: str | None = Field(default=None, max_length=32)
    stt_engine: str = Field(default="whisper.cpp", max_length=100)
    stt_model: str | None = Field(default=None, max_length=255)


class TranscriptRead(BaseModel):
    id: int
    title: str
    transcript_text: str
    source_audio_path: str | None
    source_audio_name: str | None
    language: str | None
    stt_engine: str
    stt_model: str | None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TranscriptListResponse(BaseModel):
    items: list[TranscriptRead]
