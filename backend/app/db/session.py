from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine = create_async_engine(settings.database_url, echo=settings.sql_echo, pool_pre_ping=True)

SessionFactory = async_sessionmaker(engine, expire_on_commit=False)


# зависимость FastAPI: одна сессия на запрос
async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionFactory() as session:
        yield session
