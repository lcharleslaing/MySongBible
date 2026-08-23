from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import socket
from subprocess import Popen, run
import threading

from app.core.config import Settings
from app.schemas.app_cloner import AppCloneRequest, AppCloneStatus


class AppCloneError(ValueError):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


@dataclass
class CloneJobState:
    running: bool = False
    status: str = "idle"
    message: str = "No clone has been started."
    repo_url: str | None = None
    destination_parent: str | None = None
    clone_path: str | None = None
    app_data_dir: str | None = None
    user_data_dir: str | None = None
    frontend_port: int | None = None
    backend_port: int | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    git_exit_code: int | None = None
    npm_start_pid: int | None = None


class AppCloneRunner:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.log_path = settings.app_data_dir / "app-cloner" / "clone.log"
        self._lock = threading.Lock()
        self._state = CloneJobState()

    def defaults(self) -> str | None:
        package_repo = self._package_repository_url()
        if package_repo:
            return package_repo

        completed = run(
            ["git", "config", "--get", "remote.origin.url"],
            cwd=Path.cwd(),
            capture_output=True,
            text=True,
            check=False,
        )
        if completed.returncode != 0:
            return None
        value = completed.stdout.strip()
        return value or None

    def _package_repository_url(self) -> str | None:
        package_json_path = Path(__file__).resolve().parents[3] / "package.json"
        if not package_json_path.exists():
            return None
        try:
            package_data = json.loads(package_json_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        repository = package_data.get("repository")
        if isinstance(repository, str):
            return repository.strip() or None
        if isinstance(repository, dict) and isinstance(repository.get("url"), str):
            return repository["url"].strip() or None
        return None

    def status(self) -> AppCloneStatus:
        with self._lock:
            state = CloneJobState(**self._state.__dict__)
        return self._to_status(state)

    def start(self, payload: AppCloneRequest) -> AppCloneStatus:
        clone_path = self._resolve_clone_path(payload)
        runtime = self._build_runtime_settings(clone_path)
        with self._lock:
            if self._state.running:
                raise AppCloneError("A clone job is already running.", status_code=409)
            self._state = CloneJobState(
                running=True,
                status="running",
                message="Clone started.",
                repo_url=payload.repo_url,
                destination_parent=str(Path(payload.destination_parent).expanduser().resolve()),
                clone_path=str(clone_path),
                app_data_dir=str(runtime["app_data_dir"]),
                user_data_dir=str(runtime["user_data_dir"]),
                frontend_port=int(runtime["frontend_port"]),
                backend_port=int(runtime["backend_port"]),
                started_at=self._now(),
            )
        self._reset_log()
        thread = threading.Thread(target=self._run_job, args=(payload, clone_path, runtime), daemon=True)
        thread.start()
        return self.status()

    def _run_job(self, payload: AppCloneRequest, clone_path: Path, runtime: dict[str, Path | int | str]) -> None:
        git_exit_code: int | None = None
        npm_start_pid: int | None = None
        status = "failed"
        message = "Clone failed."
        try:
            self._append_log(f"Cloning {payload.repo_url} into {clone_path}")
            git_result = run(
                ["git", "clone", payload.repo_url, str(clone_path)],
                cwd=str(Path(payload.destination_parent).expanduser().resolve()),
                capture_output=True,
                text=True,
                check=False,
            )
            git_exit_code = git_result.returncode
            self._append_log(git_result.stdout)
            self._append_log(git_result.stderr)
            if git_result.returncode != 0:
                message = f"git clone failed with exit code {git_result.returncode}."
                return

            status = "cloned"
            message = "Repository cloned."
            self._exclude_runtime_dir(clone_path)
            if payload.run_npm_start:
                env = self._build_child_env(runtime)
                self._append_log(
                    "\n".join(
                        [
                            "Starting cloned app with npm start.",
                            f"Frontend: http://127.0.0.1:{runtime['frontend_port']}",
                            f"Backend: http://127.0.0.1:{runtime['backend_port']}",
                            f"App data: {runtime['app_data_dir']}",
                            f"Electron user data: {runtime['user_data_dir']}",
                        ]
                    )
                )
                log_file = self.log_path.open("a", encoding="utf-8")
                process = Popen(
                    ["npm", "start"],
                    cwd=str(clone_path),
                    env=env,
                    stdout=log_file,
                    stderr=log_file,
                    start_new_session=True,
                )
                log_file.close()
                npm_start_pid = process.pid
                status = "started"
                message = f"Repository cloned and npm start launched with PID {process.pid}."
        except OSError as error:
            message = str(error)
            self._append_log(message)
        finally:
            with self._lock:
                self._state.running = False
                self._state.status = status
                self._state.message = message
                self._state.finished_at = self._now()
                self._state.git_exit_code = git_exit_code
                self._state.npm_start_pid = npm_start_pid

    def _resolve_clone_path(self, payload: AppCloneRequest) -> Path:
        repo_url = payload.repo_url.strip()
        if not repo_url:
            raise AppCloneError("Repository URL is required.")
        destination_parent = Path(payload.destination_parent).expanduser().resolve()
        if not destination_parent.exists() or not destination_parent.is_dir():
            raise AppCloneError("Destination location must be an existing directory.")

        directory_name = payload.directory_name.strip() if payload.directory_name else self._derive_directory_name(repo_url)
        if not directory_name or "/" in directory_name or "\\" in directory_name or directory_name in {".", ".."}:
            raise AppCloneError("Clone directory name must be a single folder name.")
        if not re.fullmatch(r"[A-Za-z0-9._-]+", directory_name):
            raise AppCloneError("Clone directory name can only contain letters, numbers, dots, underscores, and hyphens.")

        clone_path = (destination_parent / directory_name).resolve()
        if destination_parent != clone_path.parent:
            raise AppCloneError("Clone path must stay inside the selected location.")
        if clone_path.exists() and any(clone_path.iterdir()):
            raise AppCloneError("Clone directory already exists and is not empty.", status_code=409)
        return clone_path

    def _derive_directory_name(self, repo_url: str) -> str:
        cleaned = repo_url.rstrip("/")
        name = cleaned.rsplit("/", 1)[-1]
        if name.endswith(".git"):
            name = name[:-4]
        return re.sub(r"[^A-Za-z0-9._-]", "-", name)

    def _to_status(self, state: CloneJobState) -> AppCloneStatus:
        return AppCloneStatus(
            running=state.running,
            status=state.status,
            message=state.message,
            repo_url=state.repo_url,
            destination_parent=state.destination_parent,
            clone_path=state.clone_path,
            app_data_dir=state.app_data_dir,
            user_data_dir=state.user_data_dir,
            frontend_port=state.frontend_port,
            backend_port=state.backend_port,
            started_at=state.started_at,
            finished_at=state.finished_at,
            git_exit_code=state.git_exit_code,
            npm_start_pid=state.npm_start_pid,
            log_path=str(self.log_path),
            last_lines=self._last_log_lines(),
        )

    def _build_runtime_settings(self, clone_path: Path) -> dict[str, Path | int | str]:
        runtime_dir = clone_path / ".my-song-bible-runtime"
        app_data_dir = runtime_dir / "backend-data"
        user_data_dir = runtime_dir / "electron-user-data"
        backend_port = self._find_available_port()
        frontend_port = self._find_available_port(exclude={backend_port})
        return {
            "runtime_dir": runtime_dir,
            "app_data_dir": app_data_dir,
            "user_data_dir": user_data_dir,
            "database_url": f"sqlite:///{app_data_dir / 'my_song_bible.sqlite3'}",
            "backend_port": backend_port,
            "frontend_port": frontend_port,
        }

    def _build_child_env(self, runtime: dict[str, Path | int | str]) -> dict[str, str]:
        backend_port = str(runtime["backend_port"])
        frontend_port = str(runtime["frontend_port"])
        backend_url = f"http://127.0.0.1:{backend_port}"
        Path(runtime["app_data_dir"]).mkdir(parents=True, exist_ok=True)
        Path(runtime["user_data_dir"]).mkdir(parents=True, exist_ok=True)
        env = os.environ.copy()
        env.update(
            {
                "PORT": frontend_port,
                "VITE_DEV_SERVER_PORT": frontend_port,
                "ELECTRON_RENDERER_URL": f"http://127.0.0.1:{frontend_port}",
                "ELECTRON_BACKEND_PORT": backend_port,
                "BACKEND_PORT": backend_port,
                "ELECTRON_BACKEND_BASE_URL": backend_url,
                "ELECTRON_BACKEND_HEALTH_URL": f"{backend_url}/api/health",
                "APP_DATA_DIR": str(runtime["app_data_dir"]),
                "DATABASE_URL": str(runtime["database_url"]),
                "APP_TEMPLATE_USER_DATA_DIR": str(runtime["user_data_dir"]),
                "LOG_DIR": str(Path(runtime["user_data_dir"]) / "logs"),
            }
        )
        return env

    def _exclude_runtime_dir(self, clone_path: Path) -> None:
        exclude_path = clone_path / ".git" / "info" / "exclude"
        if not exclude_path.exists():
            return
        content = exclude_path.read_text(encoding="utf-8")
        if ".my-song-bible-runtime/" in content:
            return
        exclude_path.write_text(f"{content.rstrip()}\n.my-song-bible-runtime/\n", encoding="utf-8")

    def _find_available_port(self, *, exclude: set[int] | None = None) -> int:
        excluded = exclude or set()
        for _ in range(20):
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.bind(("127.0.0.1", 0))
                port = int(sock.getsockname()[1])
            if port not in excluded:
                return port
        raise AppCloneError("Could not allocate an available local port.", status_code=500)

    def _reset_log(self) -> None:
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        self.log_path.write_text("", encoding="utf-8")

    def _append_log(self, value: str) -> None:
        if not value:
            return
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        with self.log_path.open("a", encoding="utf-8") as output:
            output.write(value)
            if not value.endswith("\n"):
                output.write("\n")

    def _last_log_lines(self) -> list[str]:
        if not self.log_path.exists():
            return []
        return self.log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-80:]

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)


_runner: AppCloneRunner | None = None


def get_app_clone_runner(settings: Settings) -> AppCloneRunner:
    global _runner
    if _runner is None or _runner.settings.app_data_dir != settings.app_data_dir:
        _runner = AppCloneRunner(settings)
    return _runner
