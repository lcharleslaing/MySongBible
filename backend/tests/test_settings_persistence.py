

def test_settings_can_be_updated_and_reloaded(client) -> None:
    update_response = client.put(
        "/api/settings",
        json={
            "whisper_cpp_binary": "/tmp/whisper-cli",
            "whisper_model_path": "/tmp/ggml-base.en.bin",
            "whisper_thread_count": 6,
            "tts_engine": "piper",
            "piper_binary": "/tmp/piper",
            "piper_model_path": "/tmp/piper-model.onnx",
            "audio_input_dir": "/tmp/audio-input",
            "tts_output_dir": "/tmp/audio-output",
            "sqlite_database_path": "./data/app_template_base.sqlite3",
        },
    )
    assert update_response.status_code == 200

    payload = update_response.json()
    assert payload["whisper_cpp_binary"] == "/tmp/whisper-cli"
    assert payload["whisper_model_path"] == "/tmp/ggml-base.en.bin"
    assert payload["whisper_thread_count"] == 6
    assert payload["tts_engine"] == "piper"
    assert payload["piper_binary"] == "/tmp/piper"
    assert payload["piper_model_path"] == "/tmp/piper-model.onnx"
    assert payload["audio_input_dir"] == "/tmp/audio-input"
    assert payload["tts_output_dir"] == "/tmp/audio-output"
    assert payload["sqlite_database_path"] == "./data/app_template_base.sqlite3"
    assert payload["database_url"] == "sqlite:///./data/app_template_base.sqlite3"

    get_response = client.get("/api/settings")
    assert get_response.status_code == 200

    reloaded = get_response.json()
    assert reloaded["whisper_cpp_binary"] == "/tmp/whisper-cli"
    assert reloaded["whisper_model_path"] == "/tmp/ggml-base.en.bin"
    assert reloaded["whisper_thread_count"] == 6
    assert reloaded["tts_engine"] == "piper"
    assert reloaded["piper_binary"] == "/tmp/piper"
    assert reloaded["piper_model_path"] == "/tmp/piper-model.onnx"
    assert reloaded["audio_input_dir"] == "/tmp/audio-input"
    assert reloaded["tts_output_dir"] == "/tmp/audio-output"


def test_settings_reject_runtime_database_path_change(client) -> None:
    response = client.put(
        "/api/settings",
        json={
            "whisper_cpp_binary": None,
            "whisper_model_path": None,
            "whisper_thread_count": 4,
            "tts_engine": "mock",
            "piper_binary": None,
            "piper_model_path": None,
            "audio_input_dir": "./data/audio/input",
            "tts_output_dir": "./data/audio/tts",
            "sqlite_database_path": "./data/custom.sqlite3",
        },
    )

    assert response.status_code == 400
    assert "startup-only" in response.json()["detail"]
