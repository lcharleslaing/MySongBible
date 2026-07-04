from pathlib import Path

from fastapi.testclient import TestClient

from app.api.dependencies import get_tts_engine_manager
from app.core.config import Settings
from app.local_ai.tts.base import BaseTtsEngine, TtsEngineCapabilities, TtsSynthesisInput, TtsSynthesisResult
from app.local_ai.tts.manager import TtsEngineManager


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


def test_tts_synthesize_creates_job_and_returns_audio_path(client: TestClient, tmp_path: Path) -> None:
    def override_tts_manager() -> TtsEngineManager:
        settings = Settings(tts_output_dir=tmp_path / "tts-output")
        return FakeTtsManager(settings)

    client.app.dependency_overrides[get_tts_engine_manager] = override_tts_manager

    response = client.post(
        "/api/tts/synthesize",
        json={
            "text": "Hello from local TTS.",
            "engine": "mock",
        },
    )

    client.app.dependency_overrides.pop(get_tts_engine_manager, None)

    assert response.status_code == 201
    payload = response.json()
    assert payload["engine_used"] == "mock"
    assert payload["status"] == "completed"
    assert payload["audio_file_path"].endswith(".wav")


def test_tts_synthesize_requires_existing_voice_profile(client: TestClient) -> None:
    response = client.post(
        "/api/tts/synthesize",
        json={
            "text": "Hello",
            "voice_profile": "missing-profile",
        },
    )

    assert response.status_code == 404
