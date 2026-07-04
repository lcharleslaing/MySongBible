from datetime import datetime, timezone

from sqlmodel import Session, select

from app.local_ai.voice_cloning.base import ReferenceAudioManager
from app.models.voice_profile import VoiceProfile
from app.schemas.voice_profiles import VoiceProfileCreateRequest


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class VoiceProfileService:
    def __init__(self, session: Session, reference_audio_manager: ReferenceAudioManager) -> None:
        self.session = session
        self.reference_audio_manager = reference_audio_manager

    def list_profiles(self) -> list[VoiceProfile]:
        statement = select(VoiceProfile).order_by(VoiceProfile.created_at.desc())
        return list(self.session.exec(statement))

    def create_profile(self, payload: VoiceProfileCreateRequest) -> VoiceProfile:
        self.reference_audio_manager.validate_reference_audio_path(payload.reference_audio_path)

        profile = VoiceProfile(
            name=payload.name,
            engine=payload.engine,
            reference_audio_path=payload.reference_audio_path,
            model_path=payload.model_path,
            metadata_json=payload.metadata_json,
            updated_at=utc_now(),
        )
        self.session.add(profile)
        self.session.commit()
        self.session.refresh(profile)
        return profile
