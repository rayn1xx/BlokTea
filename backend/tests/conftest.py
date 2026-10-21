import os

# до импорта app: настройки читаются один раз при импорте app.core.config
os.environ["POSTGRES_DB"] = os.environ.get("TEST_POSTGRES_DB", "bloktea_test")
os.environ["REDIS_DB"] = os.environ.get("TEST_REDIS_DB", "15")
os.environ["JWT_SECRET"] = "test-secret"

from collections.abc import AsyncIterator  # noqa: E402
from pathlib import Path  # noqa: E402

import pytest  # noqa: E402
from alembic import command  # noqa: E402
from redis.asyncio import Redis  # noqa: E402
from redis.exceptions import ConnectionError as RedisConnectionError  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.models import Base, User  # noqa: E402
from tests.db_utils import alembic_config, create_test_engine, recreate_database  # noqa: E402
from tests.factories import make_user  # noqa: E402

TESTS_DIR = Path(__file__).parent
CATEGORIES = {"unit", "integration", "api", "migrations"}
# справочники заполняет миграция — между тестами их не чистим
REFERENCE_TABLES = {"credit_products"}


def pytest_collection_modifyitems(items: list[pytest.Item]) -> None:
    for item in items:
        category = item.path.relative_to(TESTS_DIR).parts[0]
        if category in CATEGORIES:
            item.add_marker(category)


@pytest.fixture(scope="session")
def database() -> None:
    """Пересоздаёт тестовую БД и накатывает миграции — один раз на прогон."""
    try:
        recreate_database()
    except OSError as e:
        pytest.fail(
            f"Postgres недоступен на {settings.postgres_host}:{settings.postgres_port} ({e}). "
            "Запусти: docker compose up -d db redis",
            pytrace=False,
        )
    command.upgrade(alembic_config(), "head")


# NullPool и движок на каждый тест: у pytest-asyncio свой event loop на тест,
# а соединения asyncpg привязаны к циклу, в котором открыты
@pytest.fixture
async def engine(database: None) -> AsyncIterator[AsyncEngine]:
    engine = create_test_engine()
    yield engine
    await engine.dispose()


@pytest.fixture
def session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


@pytest.fixture
async def db_session(session_factory: async_sessionmaker[AsyncSession]) -> AsyncIterator[AsyncSession]:
    async with session_factory() as session:
        yield session


@pytest.fixture
async def redis() -> AsyncIterator[Redis]:
    client = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        await client.ping()
    except RedisConnectionError as e:
        pytest.fail(
            f"Redis недоступен на {settings.redis_host}:{settings.redis_port} ({e}). "
            "Запусти: docker compose up -d db redis",
            pytrace=False,
        )
    yield client
    await client.aclose()


@pytest.fixture
async def clean_storage(engine: AsyncEngine, redis: Redis) -> None:
    """Пустые таблицы и Redis; integration и api подключают её автоматически в своих conftest."""
    tables = ", ".join(t.name for t in Base.metadata.sorted_tables if t.name not in REFERENCE_TABLES)
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} CASCADE"))
    await redis.flushdb()


@pytest.fixture
async def user(db_session: AsyncSession) -> User:
    """Активный пользователь в БД, пароль — tests.factories.DEFAULT_PASSWORD."""
    user = make_user()
    db_session.add(user)
    await db_session.commit()
    return user
