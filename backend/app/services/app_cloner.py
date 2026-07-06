from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
import re
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

    def status(self) -> AppCloneStatus:
        with self._lock:
            state = CloneJobState(**self._state.__dict__)
        return self._to_status(state)

    def start(self, payload: AppCloneRequest) -> AppCloneStatus:
        clone_path = self._resolve_clone_path(payload)
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
                started_at=self._now(),
            )
        self._reset_log()
        thread = threading.Thread(target=self._run_job, args=(payload, clone_path), daemon=True)
        thread.start()
        return self.status()

    def _run_job(self, payload: AppCloneRequest, clone_path: Path) -> None:
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
            if payload.run_npm_start:
                self._append_log("Starting cloned app with npm start.")
                log_file = self.log_path.open("a", encoding="utf-8")
                process = Popen(
                    ["npm", "start"],
                    cwd=str(clone_path),
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
            started_at=state.started_at,
            finished_at=state.finished_at,
            git_exit_code=state.git_exit_code,
            npm_start_pid=state.npm_start_pid,
            log_path=str(self.log_path),
            last_lines=self._last_log_lines(),
        )

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
