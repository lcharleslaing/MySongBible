from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from sqlmodel import Session, select

from app.local_ai.tts.base import TtsEngineError, TtsSynthesisInput
from app.local_ai.tts.manager import TtsEngineManager
from app.models.speech_job import SpeechJob
from app.models.voice_profile import VoiceProfile
from app.schemas.tts import TtsSynthesisRequest, TtsSynthesisResponse


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class TtsService:
    def __init__(self, session: Session, manager: TtsEngineManager) -> None:
        self.session = session
        self.manager = manager

    def synthesize(self, payload: TtsSynthesisRequest) -> TtsSynthesisResponse:
        if payload.voice_profile:
            self._get_voice_profile(payload.voice_profile)

        engine = self.manager.resolve_engine(payload.engine)
        output_path = self._build_output_path(engine.capabilities.output_extension)

        job = SpeechJob(
            job_type="tts",
            status="running",
            input_text=payload.text,
            output_audio_path=str(output_path),
            engine_name=engine.engine_name,
            updated_at=utc_now(),
        )
        self.session.add(job)
        self.session.commit()
        self.session.refresh(job)

        try:
            result = engine.synthesize(
                TtsSynthesisInput(
                    text=payload.text,
                    voice_profile=payload.voice_profile,
                ),
                output_path,
            )
        except TtsEngineError as error:
            job.status = "failed"
            job.error_message = error.message
            job.updated_at = utc_now()
            self.session.add(job)
            self.session.commit()
            raise

        job.status = result.status
        job.output_audio_path = str(result.audio_file_path)
        job.engine_name = result.engine_used
        job.error_message = None
        job.updated_at = utc_now()
        self.session.add(job)
        self.session.commit()
        self.session.refresh(job)

        return TtsSynthesisResponse(
            job_id=job.id or 0,
            audio_file_path=str(result.audio_file_path),
            audio_file_url=None,
            engine_used=result.engine_used,
            status=result.status,
        )

    def _build_output_path(self, extension: str) -> Path:
        output_dir = self.manager.settings.audio_tts_dir
        output_dir.mkdir(parents=True, exist_ok=True)
        return output_dir / f"tts_{uuid4().hex}.{extension}"

    def _get_voice_profile(self, profile_name: str) -> VoiceProfile:
        statement = select(VoiceProfile).where(VoiceProfile.name == profile_name)
        profile = self.session.exec(statement).first()
        if profile is None:
            raise TtsEngineError(f"Voice profile '{profile_name}' was not found.", status_code=404)
        return profile
