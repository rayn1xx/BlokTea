"""DI: фабрики зависимостей FastAPI — собирают слои db -> service для каждого запроса."""

from datetime import timedelta
from functools import lru_cache
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import PasswordHasher, TokenFactory
from app.db.redis import get_redis
from app.db.repositories import RefreshSessionRepository, UserRepository
from app.db.session import get_session
from app.models import User
from app.services.auth import AuthService
from app.services.exceptions import NotAuthenticatedError

SessionDep = Annotated[AsyncSession, Depends(get_session)]
RedisDep = Annotated[Redis, Depends(get_redis)]


# без состояния между запросами — один экземпляр на процесс
@lru_cache
def get_password_hasher() -> PasswordHasher:
    return PasswordHasher()


@lru_cache
def get_token_factory() -> TokenFactory:
    return TokenFactory(
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        access_ttl=timedelta(seconds=settings.access_token_ttl_seconds),
        refresh_ttl=timedelta(days=settings.refresh_token_ttl_days),
    )


# репозитории и сервисы — на каждый запрос; FastAPI кеширует зависимости, поэтому сессия общая
def get_user_repository(session: SessionDep) -> UserRepository:
    return UserRepository(session)


def get_refresh_session_repository(redis: RedisDep) -> RefreshSessionRepository:
    return RefreshSessionRepository(redis)


def get_auth_service(
    session: SessionDep,
    users: Annotated[UserRepository, Depends(get_user_repository)],
    refresh_sessions: Annotated[RefreshSessionRepository, Depends(get_refresh_session_repository)],
    hasher: Annotated[PasswordHasher, Depends(get_password_hasher)],
    tokens: Annotated[TokenFactory, Depends(get_token_factory)],
) -> AuthService:
    return AuthService(session, users, refresh_sessions, hasher, tokens)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    auth: AuthServiceDep,
) -> User:
    unauthorized = HTTPException(
        status.HTTP_401_UNAUTHORIZED, "not authenticated", headers={"WWW-Authenticate": "Bearer"}
    )
    if credentials is None:
        raise unauthorized

    try:
        return await auth.authenticate(credentials.credentials)
    except NotAuthenticatedError as e:
        raise unauthorized from e


CurrentUserDep = Annotated[User, Depends(get_current_user)]
