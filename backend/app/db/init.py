from pathlib import Path

from sqlmodel import SQLModel

from app.core.config import get_settings
from app.db import base  # noqa: F401
from app.db.session import engine
from app.core.runtime_paths import runtime_paths


def initialize_database() -> None:
    settings = get_settings()
    runtime_paths(settings.app_data_dir).create()
    if settings.database_url.startswith("sqlite:///"):
        Path(settings.database_url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(engine)
