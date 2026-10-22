import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


# репозитории только читают и пишут в сессию: коммит делает сервис
class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        return await self._session.get(User, user_id)

    async def get_by_login(self, login: str) -> User | None:
        return await self._session.scalar(select(User).where(User.login == login))

    async def add(self, user: User) -> User:
        self._session.add(user)
        await self._session.flush()
        return user
