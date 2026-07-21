from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.init import initialize_database
from app.services.app_lock import app_lock_service

logger = logging.getLogger(__name__)


class AppLockMiddleware:
    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] == "http":
            status = app_lock_service.status()
            path = scope.get("path", "")
            allowed = path.startswith("/api/app-lock/") or path == "/api/health"
            if status["enabled"] and not status["unlocked"] and not allowed:
                body = b'{"detail":"App is locked."}'
                await send({"type": "http.response.start", "status": 423, "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
                await send({"type": "http.response.body", "body": body})
                return
        await self.app(scope, receive, send)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    logger.info("Starting backend lifespan.")
    initialize_database()
    try:
        yield
    finally:
        logger.info("Stopping backend lifespan.")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level, settings.log_dir)
    logger.info("Creating FastAPI app '%s'.", settings.app_name)

    app = FastAPI(
        title=settings.app_name,
        version="0.1.0",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    app.add_middleware(AppLockMiddleware)

    app.include_router(api_router, prefix="/api")
    return app


app = create_app()
