from pydantic import BaseModel, Field


class TtsSynthesisRequest(BaseModel):
    text: str = Field(min_length=1)
    voice_profile: str | None = Field(default=None, max_length=100)
    engine: str | None = Field(default=None, max_length=100)


class TtsSynthesisResponse(BaseModel):
    job_id: int
    audio_file_path: str
    audio_file_url: str | None = None
    engine_used: str
    status: str
