from collections.abc import AsyncIterator, Callable

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.db.redis import get_redis
from app.db.session import get_session
from app.main import app

ClientFactory = Callable[[FastAPI], AsyncClient]


@pytest.fixture(autouse=True)
async def clean_storage(engine: AsyncEngine, redis: Redis) -> AsyncIterator[None]:
    async with engine.begin() as conn:
        await conn.execute(text("TRUNCATE users CASCADE"))
    await redis.flushdb()
    yield


@pytest.fixture
async def make_client(
    session_factory: async_sessionmaker[AsyncSession], redis: Redis
) -> AsyncIterator[ClientFactory]:
    """Клиент к любому FastAPI-приложению с подменой БД и Redis на тестовые."""

    async def override_session() -> AsyncIterator[AsyncSession]:
        async with session_factory() as session:
            yield session

    apps: list[FastAPI] = []

    def factory(target: FastAPI) -> AsyncClient:
        target.dependency_overrides[get_session] = override_session
        target.dependency_overrides[get_redis] = lambda: redis
        apps.append(target)
        return AsyncClient(transport=ASGITransport(app=target), base_url="http://test")

    yield factory

    for target in apps:
        target.dependency_overrides.clear()


@pytest.fixture
async def client(make_client: ClientFactory) -> AsyncIterator[AsyncClient]:
    async with make_client(app) as client:
        yield client
