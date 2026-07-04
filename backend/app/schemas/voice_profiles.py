from datetime import datetime

from pydantic import BaseModel, Field


class VoiceProfileCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    engine: str = Field(min_length=1, max_length=100)
    reference_audio_path: str = Field(min_length=1, max_length=500)
    model_path: str | None = Field(default=None, max_length=500)
    metadata_json: dict | None = None


class VoiceProfileRead(BaseModel):
    id: int
    name: str
    engine: str
    reference_audio_path: str
    model_path: str | None
    metadata_json: dict | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class VoiceProfileListResponse(BaseModel):
    items: list[VoiceProfileRead]


class VoiceEngineRead(BaseModel):
    engine_name: str
    supported: bool
    message: str


class VoiceEngineListResponse(BaseModel):
    items: list[VoiceEngineRead]
