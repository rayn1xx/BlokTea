import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.db.repositories import UserRepository
from app.models import User, UserRole
from tests.factories import make_user


@pytest.fixture
def repo(db_session: AsyncSession) -> UserRepository:
    return UserRepository(db_session)


async def test_add_and_get_by_id(
    repo: UserRepository, db_session: AsyncSession, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    user = await repo.add(make_user(login="a@test.local", middle_name="Петрович"))
    await db_session.commit()

    # читаем через новую сессию — иначе вернётся объект из identity map, а не из БД
    async with session_factory() as other:
        loaded = await UserRepository(other).get_by_id(user.id)

    assert loaded is not None
    assert (loaded.login, loaded.middle_name, loaded.role, loaded.is_active) == (
        "a@test.local",
        "Петрович",
        UserRole.OWNER,
        True,
    )
    assert loaded.created_at is not None


async def test_get_by_login(repo: UserRepository, user: User) -> None:
    loaded = await repo.get_by_login(user.login)

    assert loaded is not None
    assert loaded.id == user.id


async def test_get_missing_returns_none(repo: UserRepository) -> None:
    assert await repo.get_by_id(uuid.uuid4()) is None
    assert await repo.get_by_login("nobody@test.local") is None


async def test_login_is_unique(repo: UserRepository, user: User) -> None:
    with pytest.raises(IntegrityError):
        await repo.add(make_user(login=user.login))


async def test_role_stored_as_lowercase_enum_value(repo: UserRepository, db_session: AsyncSession) -> None:
    user = await repo.add(make_user(role=UserRole.FINANCE_EMPLOYEE))

    stored = await db_session.scalar(text("SELECT role::text FROM users WHERE id = :id"), {"id": user.id})

    assert stored == "finance_employee"


async def test_role_can_be_null(
    repo: UserRepository, db_session: AsyncSession, session_factory: async_sessionmaker[AsyncSession]
) -> None:
    user = await repo.add(make_user(role=None))
    await db_session.commit()

    async with session_factory() as other:
        loaded = await UserRepository(other).get_by_id(user.id)

    assert loaded is not None
    assert loaded.role is None
