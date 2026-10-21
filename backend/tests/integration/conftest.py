from collections.abc import AsyncIterator

import pytest
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


@pytest.fixture(autouse=True)
async def clean_storage(engine: AsyncEngine, redis: Redis) -> AsyncIterator[None]:
    async with engine.begin() as conn:
        await conn.execute(text("TRUNCATE users CASCADE"))
    await redis.flushdb()
    yield
