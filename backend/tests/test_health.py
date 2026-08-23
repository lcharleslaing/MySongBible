

def test_health_endpoint(client) -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["app_name"] == "My Song Bible"
    assert payload["identity"] == "com.localfirst.my.song.bible.backend"
