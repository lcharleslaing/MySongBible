from pydantic import BaseModel


class VoiceStatusResponse(BaseModel):
    status: str
    stt_engine: str
    tts_engine: str
    whisper_cpp_path: str | None
    whisper_model_dir: str | None
    message: str
