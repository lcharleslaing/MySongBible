from pathlib import Path



def test_list_voice_engines_returns_placeholder_engines(client) -> None:
    response = client.get("/api/voice-engines")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["items"]) == 2
    assert {item["engine_name"] for item in payload["items"]} == {"xtts", "f5-tts"}
    assert all(item["supported"] is False for item in payload["items"])


def test_create_and_list_voice_profiles(client, tmp_path: Path) -> None:
    reference_audio = tmp_path / "reference.wav"
    reference_audio.write_bytes(b"wav")

    create_response = client.post(
        "/api/voice-profiles",
        json={
            "name": "Narrator",
            "engine": "xtts",
            "reference_audio_path": str(reference_audio),
            "model_path": "/tmp/future-model",
            "metadata_json": {"notes": "future-ready"},
        },
    )
    assert create_response.status_code == 201

    created = create_response.json()
    assert created["name"] == "Narrator"
    assert created["engine"] == "xtts"
    assert created["reference_audio_path"] == str(reference_audio)

    list_response = client.get("/api/voice-profiles")
    assert list_response.status_code == 200
    payload = list_response.json()
    assert len(payload["items"]) == 1
    assert payload["items"][0]["name"] == "Narrator"


def test_create_voice_profile_validates_reference_audio(client) -> None:
    response = client.post(
        "/api/voice-profiles",
        json={
            "name": "Missing Audio",
            "engine": "xtts",
            "reference_audio_path": "/tmp/does-not-exist.wav",
        },
    )
    assert response.status_code == 400
