from fastapi.testclient import TestClient


def test_voice_status_endpoint(client: TestClient) -> None:
    response = client.get("/api/voice/status")
    assert response.status_code == 200

    payload = response.json()
    assert payload["status"] in {"ready", "needs_configuration"}
    assert "tts_engine" in payload
