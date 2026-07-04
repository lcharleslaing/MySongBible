from dataclasses import dataclass
from pathlib import Path
from subprocess import CompletedProcess, run
import tempfile

from app.core.config import Settings


class WhisperCppError(Exception):
    def __init__(
        self,
        message: str,
        *,
        status_code: int = 400,
        stdout: str | None = None,
        stderr: str | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.stdout = stdout
        self.stderr = stderr


@dataclass
class WhisperCppTranscriptionResult:
    text: str
    stdout: str
    stderr: str
    command: list[str]


class WhisperCppTranscriber:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def transcribe(self, audio_file_path: Path, language: str | None = None) -> WhisperCppTranscriptionResult:
        binary_path = self._require_existing_path(
            self.settings.whisper_cpp_binary,
            "WHISPER_CPP_BINARY is not configured or the binary does not exist.",
        )
        model_path = self._require_existing_path(
            self.settings.whisper_model_path,
            "WHISPER_MODEL_PATH is not configured or the model does not exist.",
        )
        input_audio_path = self._require_existing_path(
            audio_file_path,
            "Uploaded audio file does not exist.",
        )

        with tempfile.TemporaryDirectory(prefix="whispercpp-") as temp_dir:
            output_prefix = Path(temp_dir) / "transcript"
            command = [
                str(binary_path),
                "--model",
                str(model_path),
                "--file",
                str(input_audio_path),
                "--threads",
                str(self.settings.whisper_thread_count),
                "--no-gpu",
                "--no-prints",
                "--output-txt",
                "--output-file",
                str(output_prefix),
            ]

            if language:
                command.extend(["--language", language])

            completed = run(
                command,
                capture_output=True,
                text=True,
                check=False,
            )
            transcript_text = self._extract_transcript_text(completed, output_prefix)

            if completed.returncode != 0:
                raise WhisperCppError(
                    "whisper-cli failed to transcribe the audio file.",
                    status_code=502,
                    stdout=completed.stdout.strip() or None,
                    stderr=completed.stderr.strip() or None,
                )

            if not transcript_text:
                raise WhisperCppError(
                    "whisper-cli completed but returned an empty transcript.",
                    status_code=502,
                    stdout=completed.stdout.strip() or None,
                    stderr=completed.stderr.strip() or None,
                )

            return WhisperCppTranscriptionResult(
                text=transcript_text,
                stdout=completed.stdout,
                stderr=completed.stderr,
                command=command,
            )

    @staticmethod
    def _require_existing_path(path_value: Path | None, error_message: str) -> Path:
        if path_value is None or not path_value.exists():
            raise WhisperCppError(error_message, status_code=400)
        return path_value

    @staticmethod
    def _extract_transcript_text(completed: CompletedProcess[str], output_prefix: Path) -> str:
        transcript_file = output_prefix.with_suffix(".txt")
        if transcript_file.exists():
            return transcript_file.read_text(encoding="utf-8").strip()
        return completed.stdout.strip()
