from pydantic import BaseModel


class VoiceEngineStatus(BaseModel):
    id: str
    label: str
    available: bool
    configured: bool
    supports_voice_profiles: bool
    message: str


class VoiceStatusResponse(BaseModel):
    status: str
    stt_engine: str
    tts_engine: str
    default_engine: str
    engines: list[VoiceEngineStatus]
    whisper_cpp_binary: str | None
    whisper_model_path: str | None
    piper_binary: str | None = None
    piper_model_path: str | None = None
    message: str
