from fastapi.testclient import TestClient


def test_settings_can_be_updated_and_reloaded(client: TestClient) -> None:
    update_response = client.put(
        "/api/settings",
        json={
            "whisper_cpp_binary": "/tmp/whisper-cli",
            "whisper_model_path": "/tmp/ggml-base.en.bin",
            "default_tts_engine": "piper",
            "sqlite_database_path": "./data/custom.sqlite3",
        },
    )
    assert update_response.status_code == 200

    payload = update_response.json()
    assert payload["whisper_cpp_binary"] == "/tmp/whisper-cli"
    assert payload["whisper_model_path"] == "/tmp/ggml-base.en.bin"
    assert payload["default_tts_engine"] == "piper"
    assert payload["sqlite_database_path"] == "./data/custom.sqlite3"
    assert payload["database_url"] == "sqlite:///./data/custom.sqlite3"

    get_response = client.get("/api/settings")
    assert get_response.status_code == 200

    reloaded = get_response.json()
    assert reloaded["whisper_cpp_binary"] == "/tmp/whisper-cli"
    assert reloaded["whisper_model_path"] == "/tmp/ggml-base.en.bin"
    assert reloaded["default_tts_engine"] == "piper"
