from collections.abc import AsyncGenerator, Generator
import asyncio
from pathlib import Path

import httpx
import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.api.dependencies import get_session
from app.main import app


class ASGISyncClient:
    def __init__(self, app) -> None:
        self.app = app

    def get(self, url: str, **kwargs) -> httpx.Response:
        return self._request("GET", url, **kwargs)

    def post(self, url: str, **kwargs) -> httpx.Response:
        return self._request("POST", url, **kwargs)

    def put(self, url: str, **kwargs) -> httpx.Response:
        return self._request("PUT", url, **kwargs)

    def _request(self, method: str, url: str, **kwargs) -> httpx.Response:
        async def run_request() -> httpx.Response:
            transport = httpx.ASGITransport(app=self.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
                return await client.request(method, url, **kwargs)

        return asyncio.run(run_request())


@pytest.fixture
def client(tmp_path: Path) -> Generator[ASGISyncClient, None, None]:
    database_url = f"sqlite:///{tmp_path / 'test.sqlite3'}"
    engine = create_engine(database_url, connect_args={"check_same_thread": False})
    SQLModel.metadata.create_all(engine)

    async def override_get_session() -> AsyncGenerator[Session, None]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = override_get_session

    yield ASGISyncClient(app)

    app.dependency_overrides.clear()
