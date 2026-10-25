from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import InvalidAccessTokenError, PasswordHasher, TokenFactory
from app.db.repositories import ConsumeStatus, RefreshSessionRepository, UserRepository
from app.models import User
from app.services.exceptions import (
    InvalidCredentialsError,
    InvalidRefreshTokenError,
    NotAuthenticatedError,
)


@dataclass(frozen=True)
class IssuedTokens:
    access_token: str
    expires_in: int
    refresh_token: str
    refresh_expires_at: datetime


class AuthService:
    def __init__(
        self,
        session: AsyncSession,
        users: UserRepository,
        refresh_sessions: RefreshSessionRepository,
        hasher: PasswordHasher,
        tokens: TokenFactory,
    ) -> None:
        self._session = session
        self._users = users
        self._refresh_sessions = refresh_sessions
        self._hasher = hasher
        self._tokens = tokens

    async def login(self, login: str, password: str) -> IssuedTokens:
        user = await self._users.get_by_login(normalize_login(login))

        if user is None or not user.is_active or not self._hasher.verify(user.password_hash, password):
            raise InvalidCredentialsError

        if self._hasher.needs_rehash(user.password_hash):
            user.password_hash = self._hasher.hash(password)
            await self._session.commit()

        return await self._issue(user)

    async def refresh(self, refresh_token: str | None) -> IssuedTokens:
        if not refresh_token:
            raise InvalidRefreshTokenError

        result = await self._refresh_sessions.consume(self._tokens.hash_refresh_token(refresh_token))

        if result.status is ConsumeStatus.MISSING:
            raise InvalidRefreshTokenError

        if result.status is ConsumeStatus.REUSED:
            await self._refresh_sessions.revoke_all_for_user(result.user_id)
            raise InvalidRefreshTokenError

        user = await self._users.get_by_id(result.user_id)
        if user is None or not user.is_active:
            raise InvalidRefreshTokenError

        return await self._issue(user)

    async def logout(self, refresh_token: str | None) -> None:
        if refresh_token:
            await self._refresh_sessions.delete(self._tokens.hash_refresh_token(refresh_token))

    async def authenticate(self, access_token: str) -> User:
        try:
            user_id = self._tokens.decode_access_token(access_token)
        except InvalidAccessTokenError as e:
            raise NotAuthenticatedError from e

        user = await self._users.get_by_id(user_id)
        if user is None or not user.is_active:
            raise NotAuthenticatedError
        return user

    async def _issue(self, user: User) -> IssuedTokens:
        now = datetime.now(UTC)
        refresh_token = self._tokens.create_refresh_token()

        await self._refresh_sessions.add(
            self._tokens.hash_refresh_token(refresh_token), user.id, self._tokens.refresh_ttl
        )

        return IssuedTokens(
            access_token=self._tokens.create_access_token(user.id, now),
            expires_in=int(self._tokens.access_ttl.total_seconds()),
            refresh_token=refresh_token,
            refresh_expires_at=now + self._tokens.refresh_ttl,
        )


def normalize_login(login: str) -> str:
    return login.strip().lower()
