from pathlib import Path


from app.api.dependencies import get_settings_service, get_tts_engine_manager
from app.core.config import Settings
from app.local_ai.tts.base import BaseTtsEngine, TtsEngineCapabilities, TtsSynthesisInput, TtsSynthesisResult
from app.local_ai.tts.manager import TtsEngineManager
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

    audio_response = client.get(payload["audio_file_url"])
    client.app.dependency_overrides.pop(get_tts_engine_manager, None)
    client.app.dependency_overrides.pop(get_settings_service, None)

    assert audio_response.status_code == 200
    assert audio_response.content == b"fake wav bytes"


def test_tts_synthesize_requires_existing_voice_profile(client) -> None:
    response = client.post(
        "/api/tts/synthesize",
        json={
            "text": "Hello",
            "voice_profile": "missing-profile",
        },
    )

    assert response.status_code == 404
