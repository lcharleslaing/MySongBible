

from app.core.config import Settings


def test_settings_endpoint(client) -> None:
    response = client.get("/api/settings")
    assert response.status_code == 200

    payload = response.json()
    assert "app_name" in payload
    assert "database_url" in payload
    assert "tts_engine" in payload
    assert "tts_timeout_seconds" in payload
    assert "whisper_thread_count" in payload
    assert "audio_input_dir" in payload
    assert "tts_output_dir" in payload


def test_settings_loads_csv_list_values_from_env_file(tmp_path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text(
        "\n".join(
            [
                "CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,file://,null",
                "ALLOWED_AUDIO_EXTENSIONS=wav,mp3,m4a",
                "ALLOWED_AUDIO_MIME_TYPES=audio/wav,audio/mpeg,audio/m4a",
            ],
        ),
        encoding="utf-8",
    )

    settings = Settings(_env_file=env_file)

    assert settings.cors_origins == ["http://localhost:5173", "http://127.0.0.1:5173", "file://", "null"]
    assert settings.allowed_audio_extensions == ["wav", "mp3", "m4a"]
    assert settings.allowed_audio_mime_types == ["audio/wav", "audio/mpeg", "audio/m4a"]


def test_settings_resolves_repo_backend_relative_paths() -> None:
    settings = Settings(tts_output_dir="backend/data/audio/tts")

    assert str(settings.tts_output_dir).endswith("AppTemplateBase/backend/data/audio/tts")
