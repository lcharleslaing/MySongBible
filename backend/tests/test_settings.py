

def test_settings_endpoint(client) -> None:
    response = client.get("/api/settings")
    assert response.status_code == 200

    payload = response.json()
    assert "app_name" in payload
    assert "database_url" in payload
    assert "tts_engine" in payload
    assert "whisper_thread_count" in payload
    assert "audio_input_dir" in payload
    assert "tts_output_dir" in payload
