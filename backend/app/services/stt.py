from pathlib import Path
import shutil
from subprocess import run
from uuid import uuid4

from fastapi import UploadFile
from sqlmodel import Session

from app.core.config import Settings
from app.local_ai.stt.whisper_cpp import WhisperCppTranscriber
from app.schemas.transcripts import TranscriptCreate
from app.services.transcripts import TranscriptService


class SttUploadError(ValueError):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class SttService:
    def __init__(
        self,
        *,
        session: Session,
        settings: Settings,
        transcriber: WhisperCppTranscriber,
    ) -> None:
        self.session = session
        self.settings = settings
        self.transcriber = transcriber

    def transcribe_upload(
        self,
        *,
        upload_file: UploadFile,
        title: str | None = None,
        language: str | None = None,
    ):
        destination_path = self._save_upload(upload_file)
        transcription_audio_path = self._prepare_transcription_audio(destination_path)
        try:
            transcription = self.transcriber.transcribe(transcription_audio_path, language=language)
        finally:
            if transcription_audio_path != destination_path:
                transcription_audio_path.unlink(missing_ok=True)

        original_name = Path(upload_file.filename or destination_path.name).name
        transcript = TranscriptService(self.session).create_transcript(
            TranscriptCreate(
                title=title or Path(original_name).stem,
                transcript_text=transcription.text,
                source_audio_path=str(destination_path) if self.settings.keep_uploaded_audio_files else None,
                source_audio_name=original_name,
                language=language,
                stt_engine="whisper.cpp",
                stt_model=str(self.settings.whisper_model_path.name) if self.settings.whisper_model_path else None,
            ),
        )

        if not self.settings.keep_uploaded_audio_files:
            destination_path.unlink(missing_ok=True)

        return transcript

    def _save_upload(self, upload_file: UploadFile) -> Path:
        self._validate_upload_metadata(upload_file)
        audio_input_dir = self.settings.audio_input_dir
        audio_input_dir.mkdir(parents=True, exist_ok=True)

        safe_name = Path(upload_file.filename or "upload.wav").name
        destination_path = audio_input_dir / f"{uuid4().hex}_{safe_name}"

        total_bytes = 0
        with destination_path.open("wb") as output_file:
            while chunk := upload_file.file.read(1024 * 1024):
                total_bytes += len(chunk)
                if total_bytes > self.settings.max_upload_size_bytes:
                    output_file.close()
                    destination_path.unlink(missing_ok=True)
                    raise SttUploadError(
                        f"Audio upload exceeds the {self.settings.max_upload_size_bytes} byte limit.",
                        status_code=413,
                    )
                output_file.write(chunk)

        upload_file.file.close()
        return destination_path

    def _prepare_transcription_audio(self, audio_file_path: Path) -> Path:
        if audio_file_path.suffix.lower() != ".webm":
            return audio_file_path

        return self._convert_webm_to_wav(audio_file_path)

    def _convert_webm_to_wav(self, audio_file_path: Path) -> Path:
        ffmpeg_path = shutil.which("ffmpeg")
        if not ffmpeg_path:
            raise SttUploadError(
                "Recorded WebM audio requires ffmpeg for conversion before whisper.cpp transcription.",
                status_code=503,
            )

        converted_path = audio_file_path.with_name(f"{audio_file_path.stem}_whisper.wav")
        completed = run(
            [
                ffmpeg_path,
                "-y",
                "-i",
                str(audio_file_path),
                "-ac",
                "1",
                "-ar",
                "16000",
                "-vn",
                str(converted_path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )

        if completed.returncode != 0:
            converted_path.unlink(missing_ok=True)
            raise SttUploadError(
                "Could not convert recorded WebM audio to WAV for transcription.",
                status_code=502,
            )

        return converted_path

    def _validate_upload_metadata(self, upload_file: UploadFile) -> None:
        filename = upload_file.filename or ""
        extension = Path(filename).suffix.lower().lstrip(".")
        allowed_extensions = {item.lower().lstrip(".") for item in self.settings.allowed_audio_extensions}
        if extension not in allowed_extensions:
            raise SttUploadError(
                f"Unsupported audio file extension '.{extension or 'unknown'}'. Allowed extensions: {', '.join(sorted(allowed_extensions))}.",
                status_code=400,
            )

        content_type = (upload_file.content_type or "").split(";")[0].strip().lower()
        allowed_mime_types = {item.lower() for item in self.settings.allowed_audio_mime_types}
        if content_type and content_type not in allowed_mime_types:
            raise SttUploadError(
                f"Unsupported audio MIME type '{content_type}'. Allowed MIME types: {', '.join(sorted(allowed_mime_types))}.",
                status_code=400,
            )
