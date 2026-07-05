
from app.api.dependencies import get_settings_service
from app.core.config import Settings
from app.services.settings import SettingsService


def test_voice_status_endpoint(client) -> None:
    response = client.get("/api/voice/status")
    assert response.status_code == 200

    payload = response.json()
    assert payload["status"] in {"ready", "needs_configuration"}
    assert "tts_engine" in payload
    assert payload["default_engine"] == payload["tts_engine"]
    assert {engine["id"] for engine in payload["engines"]} >= {"mock", "piper"}


def test_voice_status_returns_mock_available(client) -> None:
    response = client.get("/api/voice/status")
    assert response.status_code == 200

    mock = next(engine for engine in response.json()["engines"] if engine["id"] == "mock")
    assert mock["available"] is True
    assert mock["configured"] is True
    assert mock["supports_voice_profiles"] is False


def test_voice_status_shows_piper_not_configured_when_paths_missing(client) -> None:
    class FakeSettingsService:
        def get_runtime_settings(self) -> Settings:
            return Settings(piper_binary=None, piper_model_path=None)

    async def override_settings_service() -> SettingsService:
        return FakeSettingsService()  # type: ignore[return-value]

    client.app.dependency_overrides[get_settings_service] = override_settings_service

    response = client.get("/api/voice/status")
    client.app.dependency_overrides.pop(get_settings_service, None)

    assert response.status_code == 200
    piper = next(engine for engine in response.json()["engines"] if engine["id"] == "piper")
    assert piper["available"] is False
    assert piper["configured"] is False
    assert "not configured" in piper["message"]
