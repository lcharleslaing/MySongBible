from pathlib import Path
import asyncio

from fastapi.responses import FileResponse

from app.api.dependencies import get_settings_service
from app.api.routes.audio import get_tts_audio
from app.core.config import Settings
from app.services.settings import SettingsService


def override_settings_for_tts_dir(tts_output_dir: Path):
    class FakeSettingsService:
        def get_runtime_settings(self) -> Settings:
            return Settings(tts_output_dir=tts_output_dir)

    async def override_settings_service() -> SettingsService:
        return FakeSettingsService()  # type: ignore[return-value]

    return override_settings_service


class DirectSettingsService:
    def __init__(self, tts_output_dir: Path) -> None:
        self.tts_output_dir = tts_output_dir

    def get_runtime_settings(self) -> Settings:
        return Settings(tts_output_dir=self.tts_output_dir)


def test_audio_route_blocks_path_traversal(client, tmp_path: Path) -> None:
    client.app.dependency_overrides[get_settings_service] = override_settings_for_tts_dir(tmp_path)

    response = client.get("/api/audio/tts/..%2Fsecret.wav")
    client.app.dependency_overrides.pop(get_settings_service, None)

    assert response.status_code in {400, 404}


def test_audio_route_returns_file_response_for_valid_generated_file(client, tmp_path: Path) -> None:
    audio_path = tmp_path / "generated.wav"
    audio_path.write_bytes(b"RIFFfake wav")

    response = asyncio.run(get_tts_audio("generated.wav", DirectSettingsService(tmp_path)))  # type: ignore[arg-type]

    assert isinstance(response, FileResponse)
    assert response.path == audio_path
    assert response.media_type == "audio/wav"
    assert "inline" in response.headers["content-disposition"]


def test_audio_route_uses_extension_media_type(client, tmp_path: Path) -> None:
    audio_path = tmp_path / "generated.mp3"
    audio_path.write_bytes(b"mp3")

    response = asyncio.run(get_tts_audio("generated.mp3", DirectSettingsService(tmp_path)))  # type: ignore[arg-type]

    assert isinstance(response, FileResponse)
    assert response.media_type == "audio/mpeg"
