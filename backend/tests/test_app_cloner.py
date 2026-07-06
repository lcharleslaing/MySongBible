from pathlib import Path
from subprocess import CompletedProcess
import time

from app.api.dependencies import get_app_settings
from app.core.config import Settings


def override_settings_for_app_cloner(tmp_path: Path):
    async def override_settings() -> Settings:
        return Settings(
            app_data_dir=tmp_path / "app-data",
            database_url=f"sqlite:///{tmp_path / 'test.sqlite3'}",
        )

    return override_settings


def wait_for_clone_status(client, *, timeout_seconds: float = 2.0):
    deadline = time.monotonic() + timeout_seconds
    latest = client.get("/api/app-cloner/status").json()
    while latest["running"] and time.monotonic() < deadline:
        time.sleep(0.02)
        latest = client.get("/api/app-cloner/status").json()
    return latest


def test_app_cloner_rejects_missing_destination(client, tmp_path: Path) -> None:
    client.app.dependency_overrides[get_app_settings] = override_settings_for_app_cloner(tmp_path)

    response = client.post(
        "/api/app-cloner/clone",
        json={
            "repo_url": "https://github.com/example/app.git",
            "destination_parent": str(tmp_path / "missing"),
            "directory_name": "app",
            "run_npm_start": True,
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Destination location must be an existing directory."


def test_app_cloner_runs_git_clone_and_npm_start(client, tmp_path: Path, monkeypatch) -> None:
    client.app.dependency_overrides[get_app_settings] = override_settings_for_app_cloner(tmp_path)
    destination = tmp_path / "projects"
    destination.mkdir()
    calls: list[tuple[str, list[str], str]] = []

    def fake_run(command, **kwargs):
        calls.append(("run", list(command), str(kwargs.get("cwd"))))
        if command[:2] == ["git", "clone"]:
            Path(command[-1]).mkdir(parents=True, exist_ok=True)
        return CompletedProcess(command, 0, stdout="cloned\n", stderr="")

    class FakeProcess:
        pid = 4321

    def fake_popen(command, **kwargs):
        calls.append(("popen", list(command), str(kwargs.get("cwd"))))
        return FakeProcess()

    monkeypatch.setattr("app.services.app_cloner.run", fake_run)
    monkeypatch.setattr("app.services.app_cloner.Popen", fake_popen)

    response = client.post(
        "/api/app-cloner/clone",
        json={
            "repo_url": "https://github.com/example/app.git",
            "destination_parent": str(destination),
            "directory_name": "my-app",
            "run_npm_start": True,
        },
    )

    assert response.status_code == 202
    status = wait_for_clone_status(client)
    assert status["status"] == "started"
    assert status["npm_start_pid"] == 4321
    assert status["clone_path"] == str(destination / "my-app")
    assert ("run", ["git", "clone", "https://github.com/example/app.git", str(destination / "my-app")], str(destination)) in calls
    assert ("popen", ["npm", "start"], str(destination / "my-app")) in calls


def test_app_cloner_blocks_existing_nonempty_directory(client, tmp_path: Path) -> None:
    client.app.dependency_overrides[get_app_settings] = override_settings_for_app_cloner(tmp_path)
    destination = tmp_path / "projects"
    clone_dir = destination / "app"
    clone_dir.mkdir(parents=True)
    (clone_dir / "README.md").write_text("exists", encoding="utf-8")

    response = client.post(
        "/api/app-cloner/clone",
        json={
            "repo_url": "https://github.com/example/app.git",
            "destination_parent": str(destination),
            "directory_name": "app",
            "run_npm_start": False,
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "Clone directory already exists and is not empty."
