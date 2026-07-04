from pathlib import Path

from sqlmodel import SQLModel

from app.core.config import get_settings
from app.db import base  # noqa: F401
from app.db.session import engine


def initialize_database() -> None:
    settings = get_settings()
    Path(settings.app_data_dir).mkdir(parents=True, exist_ok=True)
    SQLModel.metadata.create_all(engine)
