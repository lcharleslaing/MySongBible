from fastapi.testclient import TestClient


def test_settings_endpoint(client: TestClient) -> None:
    response = client.get("/api/settings")
    assert response.status_code == 200

    payload = response.json()
    assert "app_name" in payload
    assert "database_url" in payload
    assert "default_tts_engine" in payload
