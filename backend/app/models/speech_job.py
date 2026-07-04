from datetime import datetime, timezone

from sqlmodel import Field, SQLModel


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class SpeechJob(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    job_type: str = Field(max_length=32)
    status: str = Field(default="pending", max_length=32)
    input_text: str | None = None
    input_audio_path: str | None = Field(default=None, max_length=500)
    output_audio_path: str | None = Field(default=None, max_length=500)
    engine_name: str | None = Field(default=None, max_length=100)
    error_message: str | None = None
    created_at: datetime = Field(default_factory=utc_now, nullable=False)
    updated_at: datetime = Field(default_factory=utc_now, nullable=False)
