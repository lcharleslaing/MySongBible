import json
from types import SimpleNamespace

import pytest

from app.services import app_lock as app_lock_module
from app.services.app_lock import app_lock_service


@pytest.fixture(autouse=True)
def isolated_lock(tmp_path, monkeypatch):
    app_data = tmp_path / "user-config" / "VideoShareApp"
    monkeypatch.setattr(app_lock_module, "get_settings", lambda: SimpleNamespace(app_data_dir=app_data))
    app_lock_service.reset_session()
    yield app_data
    app_lock_service.reset_session()


def enable(client, password="correct horse"):
    return client.post("/api/app-lock/enable", json={"password": password, "confirm_password": password})


def test_disabled_by_default_and_status(client):
    response = client.get("/api/app-lock/status")
    assert response.status_code == 200
    assert response.json() == {"enabled": False, "unlocked": True}


def test_enable_writes_only_hash_to_user_app_data(client, isolated_lock, tmp_path):
    password = "secret passphrase"
    response = enable(client, password)
    assert response.status_code == 200
    path = isolated_lock / "settings" / "app-lock.json"
    assert path.exists()
    raw = path.read_text()
    record = json.loads(raw)
    assert password not in raw
    assert record["algorithm"] == "scrypt"
    assert record["password_hash"]
    assert not (tmp_path / "shared" / "config" / "app-lock.json").exists()


def test_unlock_correct_and_wrong_password(client):
    enable(client)
    client.post("/api/app-lock/lock", json={})
    assert client.get("/api/settings").status_code == 423
    wrong = client.post("/api/app-lock/unlock", json={"password": "wrong password"})
    assert wrong.status_code == 401
    assert wrong.json()["detail"] == "Incorrect password."
    correct = client.post("/api/app-lock/unlock", json={"password": "correct horse"})
    assert correct.status_code == 200
    assert correct.json()["unlocked"] is True


def test_change_requires_current_and_replaces_password(client):
    enable(client, "old password")
    denied = client.post("/api/app-lock/change-password", json={"current_password": "not the password", "new_password": "new password", "confirm_password": "new password"})
    assert denied.status_code == 401
    changed = client.post("/api/app-lock/change-password", json={"current_password": "old password", "new_password": "new password", "confirm_password": "new password"})
    assert changed.status_code == 200
    client.post("/api/app-lock/lock", json={})
    assert client.post("/api/app-lock/unlock", json={"password": "old password"}).status_code == 401
    assert client.post("/api/app-lock/unlock", json={"password": "new password"}).status_code == 200


def test_disable_requires_current_and_removes_startup_lock(client, isolated_lock):
    enable(client)
    assert client.post("/api/app-lock/disable", json={"current_password": "wrong password"}).status_code == 401
    response = client.post("/api/app-lock/disable", json={"current_password": "correct horse"})
    assert response.status_code == 200
    assert response.json()["enabled"] is False
    assert not (isolated_lock / "settings" / "app-lock.json").exists()
    app_lock_service.reset_session()
    assert client.get("/api/app-lock/status").json() == {"enabled": False, "unlocked": True}


def test_password_validation(client):
    assert enable(client, "short").status_code == 400
    mismatch = client.post("/api/app-lock/enable", json={"password": "long enough", "confirm_password": "different value"})
    assert mismatch.status_code == 400


def test_temporary_lockout_after_repeated_failures(client):
    enable(client)
    client.post("/api/app-lock/lock", json={})
    for _ in range(5):
        client.post("/api/app-lock/unlock", json={"password": "wrong password"})
    assert client.post("/api/app-lock/unlock", json={"password": "correct horse"}).status_code == 429
