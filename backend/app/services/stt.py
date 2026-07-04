from pathlib import Path
import shutil
from uuid import uuid4

from fastapi import UploadFile
from sqlmodel import Session

from app.core.config import Settings
from app.local_ai.stt.whisper_cpp import WhisperCppTranscriber
from app.schemas.transcripts import TranscriptCreate
from app.services.transcripts import TranscriptService


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
        transcription = self.transcriber.transcribe(destination_path, language=language)

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
        audio_input_dir = self.settings.audio_input_dir
        audio_input_dir.mkdir(parents=True, exist_ok=True)

        safe_name = Path(upload_file.filename or "upload.wav").name
        destination_path = audio_input_dir / f"{uuid4().hex}_{safe_name}"

        with destination_path.open("wb") as output_file:
            shutil.copyfileobj(upload_file.file, output_file)

        upload_file.file.close()
        return destination_path
