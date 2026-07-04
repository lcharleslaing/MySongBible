from sqlalchemy.engine import Engine
from sqlmodel import create_engine

from app.core.config import get_settings


def create_db_engine() -> Engine:
    settings = get_settings()
    connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
    return create_engine(
        settings.database_url,
        echo=settings.database_echo,
        connect_args=connect_args,
    )


engine = create_db_engine()
