from datetime import datetime, timezone

from sqlmodel import Session, select

from app.models.transcript import Transcript
from app.schemas.transcripts import TranscriptCreate


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class TranscriptService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_transcripts(self) -> list[Transcript]:
        statement = select(Transcript).order_by(Transcript.created_at.desc())
        return list(self.session.exec(statement))

    def create_transcript(self, payload: TranscriptCreate) -> Transcript:
        transcript = Transcript(
            title=payload.title,
            transcript_text=payload.transcript_text,
            source_audio_path=payload.source_audio_path,
            source_audio_name=payload.source_audio_name,
            language=payload.language,
            stt_engine=payload.stt_engine,
            stt_model=payload.stt_model,
            updated_at=utc_now(),
        )
        self.session.add(transcript)
        self.session.commit()
        self.session.refresh(transcript)
        return transcript
