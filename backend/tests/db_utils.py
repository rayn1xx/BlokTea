import asyncio
from pathlib import Path

from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings

BACKEND_DIR = Path(__file__).resolve().parent.parent


def alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
    return config


def create_test_engine() -> AsyncEngine:
    return create_async_engine(settings.database_url, poolclass=NullPool)


def recreate_database() -> None:
    # база удаляется целиком: защита от запуска на рабочей БД
    if not settings.postgres_db.endswith("_test"):
        raise RuntimeError(f"тесты запускаются только на базе *_test, а не {settings.postgres_db!r}")

    async def run() -> None:
        admin_url = settings.database_url.rsplit("/", 1)[0] + "/postgres"
        admin = create_async_engine(admin_url, isolation_level="AUTOCOMMIT", poolclass=NullPool)
        async with admin.connect() as conn:
            await conn.execute(text(f'DROP DATABASE IF EXISTS "{settings.postgres_db}" WITH (FORCE)'))
            await conn.execute(text(f'CREATE DATABASE "{settings.postgres_db}"'))
        await admin.dispose()

    asyncio.run(run())
