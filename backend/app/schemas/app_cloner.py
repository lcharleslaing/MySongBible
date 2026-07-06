from datetime import datetime

from pydantic import BaseModel, Field


class AppCloneRequest(BaseModel):
    repo_url: str = Field(min_length=1, max_length=500)
    destination_parent: str = Field(min_length=1, max_length=500)
    directory_name: str | None = Field(default=None, max_length=120)
    run_npm_start: bool = True


class AppCloneStatus(BaseModel):
    running: bool
    status: str
    message: str
    repo_url: str | None = None
    destination_parent: str | None = None
    clone_path: str | None = None
    started_at: datetime | None = None
    finished_at: datetime | None = None
    git_exit_code: int | None = None
    npm_start_pid: int | None = None
    log_path: str
    last_lines: list[str] = []


class AppCloneDefaults(BaseModel):
    repo_url: str | None = None
