"""In-memory замены репозиториев и сессии — AuthService тестируется без БД и Redis."""

import uuid
from datetime import timedelta

from app.db.repositories import ConsumeResult, ConsumeStatus
from app.models import User


class FakeSession:
    def __init__(self) -> None:
        self.commits = 0

    async def commit(self) -> None:
        self.commits += 1


class FakeUserRepository:
    def __init__(self, *users: User) -> None:
        self.users = {user.id: user for user in users}

    async def get_by_id(self, user_id: uuid.UUID) -> User | None:
        return self.users.get(user_id)

    async def get_by_login(self, login: str) -> User | None:
        return next((u for u in self.users.values() if u.login == login), None)

    async def add(self, user: User) -> User:
        self.users[user.id] = user
        return user


class FakeRefreshSessionRepository:
    def __init__(self) -> None:
        # token_hash -> {"user_id", "revoked", "ttl"}
        self.sessions: dict[str, dict] = {}
        self.revoked_users: list[uuid.UUID] = []

    async def add(self, token_hash: str, user_id: uuid.UUID, ttl: timedelta) -> None:
        self.sessions[token_hash] = {"user_id": user_id, "revoked": False, "ttl": ttl}

    async def consume(self, token_hash: str) -> ConsumeResult:
        session = self.sessions.get(token_hash)
        if session is None:
            return ConsumeResult(ConsumeStatus.MISSING)
        if session["revoked"]:
            return ConsumeResult(ConsumeStatus.REUSED, session["user_id"])
        session["revoked"] = True
        return ConsumeResult(ConsumeStatus.OK, session["user_id"])

    async def delete(self, token_hash: str) -> None:
        self.sessions.pop(token_hash, None)

    async def revoke_all_for_user(self, user_id: uuid.UUID) -> None:
        self.revoked_users.append(user_id)
        self.sessions = {h: s for h, s in self.sessions.items() if s["user_id"] != user_id}
