from collections.abc import AsyncIterator, Callable

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.api.deps import get_external_factory, get_session_factory
from app.core.config import settings
from app.db.redis import get_redis
from app.db.session import get_session
from app.integrations.external import open_external
from app.main import app
from mocks.main import app as mocks_app

ClientFactory = Callable[[FastAPI], AsyncClient]


@pytest.fixture(autouse=True)
async def _clean(clean_storage: None) -> None:
    pass


@pytest.fixture(autouse=True)
def _uploads(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "upload_dir", str(tmp_path / "uploads"))


def mocks_factory():
    # сервис моков поднимается в том же процессе, без сети
    return open_external(ASGITransport(app=mocks_app))


@pytest.fixture
async def make_client(session_factory: async_sessionmaker[AsyncSession], redis: Redis) -> AsyncIterator[ClientFactory]:
    """Клиент к любому FastAPI-приложению с подменой БД, Redis и моков на тестовые."""

    async def override_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    apps: list[FastAPI] = []

    def factory(target: FastAPI) -> AsyncClient:
        target.dependency_overrides[get_session] = override_session
        target.dependency_overrides[get_redis] = lambda: redis
        target.dependency_overrides[get_session_factory] = lambda: session_factory
        target.dependency_overrides[get_external_factory] = lambda: mocks_factory
        apps.append(target)
        return AsyncClient(transport=ASGITransport(app=target), base_url="http://test")

    yield factory

    for target in apps:
        target.dependency_overrides.clear()


@pytest.fixture
async def client(make_client: ClientFactory) -> AsyncIterator[AsyncClient]:
    async with make_client(app) as client:
        yield client


@pytest.fixture
async def demo(session_factory: async_sessionmaker[AsyncSession]) -> None:
    """Демо-данные раздела 6 ТЗ в тестовой базе."""
    from app.seed import seed

    async with session_factory() as session:
        await seed(session)
        await session.commit()


def auth(user_id) -> dict[str, str]:
    from app.api.deps import get_token_factory

    return {"Authorization": f"Bearer {get_token_factory().create_access_token(user_id)}"}
