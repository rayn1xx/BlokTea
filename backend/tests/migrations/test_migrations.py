import asyncio

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import inspect, text

from app.models import Base
from tests.db_utils import alembic_config, create_test_engine


def schema_state() -> tuple[set[str], set[str]]:
    async def run() -> tuple[set[str], set[str]]:
        engine = create_test_engine()
        async with engine.connect() as conn:
            tables = await conn.run_sync(lambda c: set(inspect(c).get_table_names()))
            enums = set((await conn.execute(text("SELECT typname FROM pg_type WHERE typtype = 'e'"))).scalars())
        await engine.dispose()
        return tables, enums

    return asyncio.run(run())


def models_vs_database_diff() -> list:
    async def run() -> list:
        engine = create_test_engine()
        async with engine.connect() as conn:
            diff = await conn.run_sync(
                lambda c: compare_metadata(MigrationContext.configure(c, opts={"compare_type": True}), Base.metadata)
            )
        await engine.dispose()
        return diff

    return asyncio.run(run())


def test_single_head() -> None:
    # две головы — значит, две ветки миграций не слили
    assert len(ScriptDirectory.from_config(alembic_config()).get_heads()) == 1


def test_downgrade_to_base_and_upgrade_back(database: None) -> None:
    config = alembic_config()

    command.downgrade(config, "base")
    tables, enums = schema_state()
    assert tables == {"alembic_version"}
    assert enums == set()

    command.upgrade(config, "head")
    tables, enums = schema_state()
    assert "users" in tables
    assert "user_role" in enums


def test_models_match_migrations(database: None) -> None:
    # непустой diff — модель поменяли, а миграцию не сгенерировали
    assert models_vs_database_diff() == []
