from pydantic import BaseModel


class VoiceStatusResponse(BaseModel):
    status: str
    stt_engine: str
    tts_engine: str
    whisper_cpp_binary: str | None
    whisper_model_path: str | None
    message: str
