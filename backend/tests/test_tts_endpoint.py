from pathlib import Path

from sqlmodel import Session, select

from app.api.dependencies import get_settings_service, get_tts_engine_manager
from app.core.config import Settings
from app.local_ai.tts.base import BaseTtsEngine, TtsEngineCapabilities, TtsEngineError, TtsSynthesisInput, TtsSynthesisResult
from app.local_ai.tts.manager import TtsEngineManager
from app.models.speech_job import SpeechJob
from app.services.settings import SettingsService


class FakeTtsEngine(BaseTtsEngine):
    engine_name = "mock"
    capabilities = TtsEngineCapabilities(output_extension="wav")

    def is_available(self) -> bool:
        return True

    def synthesize(self, request: TtsSynthesisInput, output_path: Path) -> TtsSynthesisResult:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"fake wav bytes")
        return TtsSynthesisResult(
            audio_file_path=output_path,
            engine_used=self.engine_name,
            status="completed",
        )


class FakeTtsManager(TtsEngineManager):
    def __init__(self, settings: Settings) -> None:
        super().__init__(settings)

    def resolve_engine(self, requested_engine: str | None = None) -> BaseTtsEngine:
        return FakeTtsEngine()


class FakePiperManager(TtsEngineManager):
    def resolve_engine(self, requested_engine: str | None = None) -> BaseTtsEngine:
        engine = FakeTtsEngine()
        engine.engine_name = "piper"
        return engine


class FailingTtsManager(TtsEngineManager):
    def resolve_engine(self, requested_engine: str | None = None) -> BaseTtsEngine:
        raise TtsEngineError("Requested TTS engine is not configured.", status_code=400)


def test_tts_synthesize_creates_job_and_returns_audio_path(client, tmp_path: Path) -> None:
    tts_output_dir = tmp_path / "tts-output"

    async def override_tts_manager() -> TtsEngineManager:
        settings = Settings(tts_output_dir=tts_output_dir)
        return FakeTtsManager(settings)

    class FakeSettingsService:
        def get_runtime_settings(self) -> Settings:
            return Settings(tts_output_dir=tts_output_dir)

    async def override_settings_service() -> SettingsService:
        return FakeSettingsService()  # type: ignore[return-value]

    client.app.dependency_overrides[get_tts_engine_manager] = override_tts_manager
    client.app.dependency_overrides[get_settings_service] = override_settings_service

    response = client.post(
        "/api/tts/synthesize",
        json={
            "text": "Hello from local TTS.",
            "engine": "mock",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["engine_used"] == "mock"
    assert payload["status"] == "completed"
    assert payload["audio_file_path"].endswith(".wav")
    assert payload["audio_file_url"].startswith("/api/audio/tts/")
    assert Path(payload["audio_file_path"]).read_bytes() == b"fake wav bytes"

    client.app.dependency_overrides.pop(get_tts_engine_manager, None)
    client.app.dependency_overrides.pop(get_settings_service, None)


def test_tts_synthesize_rejects_voice_profile_for_mock(client) -> None:
    response = client.post(
        "/api/tts/synthesize",
        json={
            "text": "Hello",
            "voice_profile": "missing-profile",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"]["message"] == "Engine 'mock' does not support voice profiles."


def test_tts_synthesize_rejects_voice_profile_for_piper(client, tmp_path: Path) -> None:
    async def override_tts_manager() -> TtsEngineManager:
        return FakePiperManager(Settings(tts_output_dir=tmp_path / "tts-output"))

    client.app.dependency_overrides[get_tts_engine_manager] = override_tts_manager

    response = client.post(
        "/api/tts/synthesize",
        json={
            "text": "Hello",
            "engine": "piper",
            "voice_profile": "profile-name",
        },
    )
    client.app.dependency_overrides.pop(get_tts_engine_manager, None)

    assert response.status_code == 400
    assert response.json()["detail"]["message"] == "Engine 'piper' does not support voice profiles."


def test_tts_failed_engine_resolution_creates_failed_speech_job(client, tmp_path: Path) -> None:
    async def override_tts_manager() -> TtsEngineManager:
        return FailingTtsManager(Settings(tts_output_dir=tmp_path / "tts-output"))

    client.app.dependency_overrides[get_tts_engine_manager] = override_tts_manager

    response = client.post(
        "/api/tts/synthesize",
        json={
            "text": "Hello",
            "engine": "piper",
        },
    )
    client.app.dependency_overrides.pop(get_tts_engine_manager, None)

    assert response.status_code == 400
    detail = response.json()["detail"]
    assert detail["job_id"] is not None
    assert detail["status"] == "failed"

    with Session(client.engine) as session:
        job = session.exec(select(SpeechJob).where(SpeechJob.id == detail["job_id"])).one()

    assert job.status == "failed"
    assert job.engine_name == "piper"
    assert job.error_message == "Requested TTS engine is not configured."
