from pathlib import Path

from app.local_ai.voice_cloning.base import VoiceCloneEngine, VoiceCloneEngineResponse


class XTTSVoiceCloneEngine(VoiceCloneEngine):
    engine_name = "xtts"

    def status(self) -> VoiceCloneEngineResponse:
        return VoiceCloneEngineResponse(
            supported=False,
            engine_name=self.engine_name,
            message="XTTS voice cloning is not implemented yet. Add the local model/runtime integration in this engine class.",
        )

    def create_profile(self, name: str, reference_audio_path: Path, model_path: Path | None = None) -> VoiceCloneEngineResponse:
        raise NotImplementedError(
            "XTTS voice cloning is not implemented yet. Future implementation should live in XTTSVoiceCloneEngine.",
        )


class F5TTSVoiceCloneEngine(VoiceCloneEngine):
    engine_name = "f5-tts"

    def status(self) -> VoiceCloneEngineResponse:
        return VoiceCloneEngineResponse(
            supported=False,
            engine_name=self.engine_name,
            message="F5-TTS voice cloning is not implemented yet. Add the local model/runtime integration in this engine class.",
        )

    def create_profile(self, name: str, reference_audio_path: Path, model_path: Path | None = None) -> VoiceCloneEngineResponse:
        raise NotImplementedError(
            "F5-TTS voice cloning is not implemented yet. Future implementation should live in F5TTSVoiceCloneEngine.",
        )
