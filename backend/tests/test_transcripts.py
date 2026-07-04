from fastapi.testclient import TestClient


def test_list_transcripts_defaults_empty(client: TestClient) -> None:
    response = client.get("/api/transcripts")
    assert response.status_code == 200
    assert response.json() == {"items": []}


def test_create_and_list_transcripts(client: TestClient) -> None:
    create_response = client.post(
        "/api/transcripts",
        json={
            "title": "Test Transcript",
            "transcript_text": "Hello from a local transcript.",
            "source_audio_path": "/tmp/input.wav",
            "source_audio_name": "input.wav",
            "language": "en",
            "stt_engine": "whisper.cpp",
            "stt_model": "tiny.en",
        },
    )
    assert create_response.status_code == 201

    created = create_response.json()
    assert created["title"] == "Test Transcript"
    assert created["source_audio_path"] == "/tmp/input.wav"

    list_response = client.get("/api/transcripts")
    assert list_response.status_code == 200
    payload = list_response.json()
    assert len(payload["items"]) == 1
    assert payload["items"][0]["title"] == "Test Transcript"
