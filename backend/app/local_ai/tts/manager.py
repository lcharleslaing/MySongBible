from dataclasses import dataclass
import os

from app.core.config import Settings
from app.local_ai.tts.base import BaseTtsEngine, TtsEngineError
from app.local_ai.tts.mock import MockTtsEngine
from app.local_ai.tts.piper import PiperEngine


@dataclass(frozen=True)
class TtsEngineStatus:
    id: str
    label: str
    available: bool
    configured: bool
    supports_voice_profiles: bool
    message: str


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

    def get_engine_statuses(self) -> list[TtsEngineStatus]:
        mock = MockTtsEngine()
        return [
            TtsEngineStatus(
                id=mock.engine_name,
                label="Mock",
                available=True,
                configured=True,
                supports_voice_profiles=mock.capabilities.supports_voice_profiles,
                message="Mock TTS is available for testing.",
            ),
            self._get_piper_status(),
        ]

    def _get_piper_status(self) -> TtsEngineStatus:
        piper = PiperEngine(self.settings)
        binary_path = self.settings.piper_binary
        model_path = self.settings.piper_model_path

        if binary_path is None or model_path is None:
            return TtsEngineStatus(
                id=piper.engine_name,
                label="Piper",
                available=False,
                configured=False,
                supports_voice_profiles=piper.capabilities.supports_voice_profiles,
                message="Piper binary or model path is not configured.",
            )

        if not binary_path.exists() or not model_path.exists():
            return TtsEngineStatus(
                id=piper.engine_name,
                label="Piper",
                available=False,
                configured=False,
                supports_voice_profiles=piper.capabilities.supports_voice_profiles,
                message="Piper binary or model path does not exist.",
            )

        if binary_path.is_file() and not os.access(binary_path, os.X_OK):
            return TtsEngineStatus(
                id=piper.engine_name,
                label="Piper",
                available=False,
                configured=True,
                supports_voice_profiles=piper.capabilities.supports_voice_profiles,
                message="Piper binary exists but is not executable.",
            )

        return TtsEngineStatus(
            id=piper.engine_name,
            label="Piper",
            available=True,
            configured=True,
            supports_voice_profiles=piper.capabilities.supports_voice_profiles,
            message="Piper is configured and ready.",
        )
