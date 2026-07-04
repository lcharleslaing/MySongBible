from app.core.config import Settings
from app.local_ai.tts.base import BaseTtsEngine, TtsEngineError
from app.local_ai.tts.mock import MockTtsEngine
from app.local_ai.tts.piper import PiperEngine


class TtsEngineManager:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def resolve_engine(self, requested_engine: str | None = None) -> BaseTtsEngine:
        engine_name = (requested_engine or self.settings.tts_engine).strip().lower()

        if engine_name == "piper":
            piper = PiperEngine(self.settings)
            if piper.is_available():
                return piper
            if requested_engine:
                raise TtsEngineError(
                    "Piper was requested but is not configured or available on this machine.",
                    status_code=400,
                )

        if engine_name in {"mock", "placeholder", ""} or not requested_engine:
            return MockTtsEngine()

        raise TtsEngineError(f"Unsupported TTS engine '{engine_name}'.", status_code=400)
