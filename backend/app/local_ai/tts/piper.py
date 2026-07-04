from pathlib import Path
from subprocess import TimeoutExpired, run

from app.core.config import Settings
from app.local_ai.tts.base import (
    BaseTtsEngine,
    TtsEngineCapabilities,
    TtsEngineError,
    TtsSynthesisInput,
    TtsSynthesisResult,
)


class PiperEngine(BaseTtsEngine):
    engine_name = "piper"
    capabilities = TtsEngineCapabilities(
        supports_voice_profiles=False,
        supports_voice_cloning=False,
        output_extension="wav",
    )

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def is_available(self) -> bool:
        return bool(
            self.settings.piper_binary
            and self.settings.piper_binary.exists()
            and self.settings.piper_model_path
            and self.settings.piper_model_path.exists()
        )

    def synthesize(self, request: TtsSynthesisInput, output_path: Path) -> TtsSynthesisResult:
        binary_path = self._require_path(
            self.settings.piper_binary,
            "PIPER_BINARY is not configured or the binary does not exist.",
        )
        model_path = self._require_path(
            self.settings.piper_model_path,
            "PIPER_MODEL_PATH is not configured or the model does not exist.",
        )

        output_path.parent.mkdir(parents=True, exist_ok=True)
        command = [
            str(binary_path),
            "--model",
            str(model_path),
            "--output_file",
            str(output_path),
        ]

        try:
            completed = run(
                command,
                input=request.text,
                capture_output=True,
                text=True,
                check=False,
                timeout=self.settings.tts_timeout_seconds,
            )
        except TimeoutExpired as error:
            raise TtsEngineError(
                f"Piper timed out after {self.settings.tts_timeout_seconds} seconds.",
                status_code=504,
                stdout=error.stdout.decode("utf-8", errors="replace") if isinstance(error.stdout, bytes) else error.stdout,
                stderr=error.stderr.decode("utf-8", errors="replace") if isinstance(error.stderr, bytes) else error.stderr,
            ) from error

        if completed.returncode != 0:
            raise TtsEngineError(
                "Piper failed to synthesize speech.",
                status_code=502,
                stdout=completed.stdout.strip() or None,
                stderr=completed.stderr.strip() or None,
            )

        if not output_path.exists():
            raise TtsEngineError(
                "Piper completed without producing an output audio file.",
                status_code=502,
                stdout=completed.stdout.strip() or None,
                stderr=completed.stderr.strip() or None,
            )

        return TtsSynthesisResult(
            audio_file_path=output_path,
            engine_used=self.engine_name,
            status="completed",
            stdout=completed.stdout,
            stderr=completed.stderr,
        )

    @staticmethod
    def _require_path(path_value: Path | None, error_message: str) -> Path:
        if path_value is None or not path_value.exists():
            raise TtsEngineError(error_message, status_code=400)
        return path_value
