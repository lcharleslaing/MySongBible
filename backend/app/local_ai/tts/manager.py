from app.core.config import Settings
from app.local_ai.tts.base import BaseTtsEngine, TtsEngineError
from app.local_ai.tts.mock import MockTtsEngine
from app.local_ai.tts.piper import PiperEngine


class TtsEngineManager:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def resolve_engine(self, requested_engine: str | None = None) -> BaseTtsEngine:
        engine_name = (requested_engine or self.settings.tts_engine).strip().lower()

        if engine_name == "mock":
            return MockTtsEngine()

        if engine_name == "piper":
            piper = PiperEngine(self.settings)
            if piper.is_available():
                return piper
            raise TtsEngineError(
                "Piper is configured but is not available on this machine. Check PIPER_BINARY and PIPER_MODEL_PATH.",
                status_code=400,
            )

        if engine_name in {"placeholder", ""}:
            return MockTtsEngine()

        raise TtsEngineError(f"Unsupported TTS engine '{engine_name}'.", status_code=400)
