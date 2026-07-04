from pydantic import BaseModel


class VoiceStatusResponse(BaseModel):
    status: str
    stt_engine: str
    tts_engine: str
    whisper_cpp_binary: str | None
    whisper_model_path: str | None
    piper_binary: str | None = None
    piper_model_path: str | None = None
    message: str
