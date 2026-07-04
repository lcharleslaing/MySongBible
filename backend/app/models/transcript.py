from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Transcript(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    title: str = Field(max_length=200)
    transcript_text: str
    source_audio_path: str | None = Field(default=None, max_length=500)
    source_audio_name: str | None = Field(default=None, max_length=255)
    language: str | None = Field(default=None, max_length=32)
    stt_engine: str = Field(default="whisper.cpp")
    stt_model: str | None = Field(default=None, max_length=255)
    status: str = Field(default="completed", max_length=32)
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    updated_at: datetime = Field(default_factory=utc_now, nullable=False)
