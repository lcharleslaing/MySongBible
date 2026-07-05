from pathlib import Path
import wave

from app.local_ai.tts.base import BaseTtsEngine, TtsEngineCapabilities, TtsSynthesisInput, TtsSynthesisResult


class MockTtsEngine(BaseTtsEngine):
    engine_name = "mock"
    capabilities = TtsEngineCapabilities(
        supports_voice_profiles=False,
        supports_voice_cloning=False,
        output_extension="wav",
    )

    def is_available(self) -> bool:
        return True

    def synthesize(self, request: TtsSynthesisInput, output_path: Path) -> TtsSynthesisResult:
        output_path.parent.mkdir(parents=True, exist_ok=True)

        with wave.open(str(output_path), "w") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(22050)
            wav_file.writeframes(b"\x00\x00" * 22050)

        return TtsSynthesisResult(
            audio_file_path=output_path,
            engine_used=self.engine_name,
            status="completed",
            stdout=f"Mock TTS wrote a placeholder WAV for text length {len(request.text)}.",
            stderr="",
        )
