"""Тестовые пользователи для локальной разработки: python -m app.seed (повторный запуск безопасен).

Логин ivanov@test.local из frontend/src/api/demo.ts не используем: фронт перехватывает его
и до бэкенда запрос не доходит.
"""

import asyncio
import uuid
from datetime import date

from app.api.deps import get_password_hasher
from app.db.repositories import UserRepository
from app.db.session import SessionFactory, engine
from app.models import User, UserRole

SEED_USERS = [
    dict(
        id=uuid.UUID("7f3c2a9e-1b4d-4e8a-9c21-5d6f7a8b9c01"),
        login="owner@test.local",
        password="owner123",
        first_name="Иван",
        middle_name="Петрович",
        birth_date=date(1985, 4, 12),
        role=UserRole.OWNER,
    ),
    # вход есть, доступа нет — для проверки страницы «Нет доступа»
    dict(
        id=uuid.UUID("7f3c2a9e-1b4d-4e8a-9c21-5d6f7a8b9c02"),
        login="norole@test.local",
        password="norole123",
        first_name="Пётр",
        middle_name=None,
        birth_date=None,
        role=None,
    ),
    dict(
        id=uuid.UUID("7f3c2a9e-1b4d-4e8a-9c21-5d6f7a8b9c03"),
        login="serbelko",
        password="1234",
        first_name="Serbelko",
        middle_name=None,
        birth_date=None,
        role=UserRole.OWNER,
    ),
]


async def seed() -> None:
    hasher = get_password_hasher()

    async with SessionFactory() as session:
        users = UserRepository(session)
        for data in SEED_USERS:
            data = dict(data)
            if await users.get_by_login(data["login"]):
                continue
            password = data.pop("password")
            await users.add(User(**data, password_hash=hasher.hash(password)))
            print(f"created {data['login']}")
        await session.commit()

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(seed())
