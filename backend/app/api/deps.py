from collections.abc import AsyncIterator, Callable
from datetime import timedelta
from functools import lru_cache
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import settings
from app.core.errors import ApiError
from app.core.security import PasswordHasher, TokenFactory
from app.db.redis import get_redis
from app.db.repositories import RefreshSessionRepository, UserRepository
from app.db.session import SessionFactory, get_session
from app.integrations.external import ExternalSystems, open_external
from app.models import User
from app.services.applications import ApplicationService
from app.services.auth import AuthService
from app.services.bank import BankService
from app.services.common import ClientContext, client_context, require_bank, require_underwriter
from app.services.company import CompanyService
from app.services.documents import DocumentService
from app.services.exceptions import NotAuthenticatedError
from app.services.feed import FeedService
from app.services.home import HomeService
from app.services.matching import MatchingService
from app.services.tasks import TaskService
from app.services.team import TeamService

SessionDep = Annotated[AsyncSession, Depends(get_session)]
RedisDep = Annotated[Redis, Depends(get_redis)]


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


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    return SessionFactory


def get_external_factory() -> Callable[[], Any]:
    return open_external


SessionFactoryDep = Annotated[async_sessionmaker[AsyncSession], Depends(get_session_factory)]
ExternalFactoryDep = Annotated[Callable[[], Any], Depends(get_external_factory)]


async def get_external(factory: ExternalFactoryDep) -> AsyncIterator[ExternalSystems]:
    async with factory() as external:
        yield external


ExternalDep = Annotated[ExternalSystems, Depends(get_external)]


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


def get_home_service(session: SessionDep) -> HomeService:
    return HomeService(session)


def get_application_service(session: SessionDep, external: ExternalDep) -> ApplicationService:
    return ApplicationService(session, external)


def get_company_service(session: SessionDep, external: ExternalDep) -> CompanyService:
    return CompanyService(session, external)


def get_team_service(session: SessionDep) -> TeamService:
    return TeamService(session)


def get_task_service(session: SessionDep) -> TaskService:
    return TaskService(session)


def get_matching_service(session: SessionDep, external: ExternalDep) -> MatchingService:
    return MatchingService(session, external)


def get_document_service(session: SessionDep, external: ExternalDep) -> DocumentService:
    return DocumentService(session, external)


def get_feed_service(session: SessionDep, external: ExternalDep) -> FeedService:
    return FeedService(session, external)


def get_bank_service(session: SessionDep, external: ExternalDep) -> BankService:
    return BankService(session, external)


HomeServiceDep = Annotated[HomeService, Depends(get_home_service)]
ApplicationServiceDep = Annotated[ApplicationService, Depends(get_application_service)]
CompanyServiceDep = Annotated[CompanyService, Depends(get_company_service)]
TeamServiceDep = Annotated[TeamService, Depends(get_team_service)]
TaskServiceDep = Annotated[TaskService, Depends(get_task_service)]
MatchingServiceDep = Annotated[MatchingService, Depends(get_matching_service)]
DocumentServiceDep = Annotated[DocumentService, Depends(get_document_service)]
FeedServiceDep = Annotated[FeedService, Depends(get_feed_service)]
BankServiceDep = Annotated[BankService, Depends(get_bank_service)]

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    auth: AuthServiceDep,
) -> User:
    unauthorized = HTTPException(
        status.HTTP_401_UNAUTHORIZED, "Нужна авторизация", headers={"WWW-Authenticate": "Bearer"}
    )
    if credentials is None:
        raise unauthorized

    try:
        return await auth.authenticate(credentials.credentials)
    except NotAuthenticatedError as e:
        raise unauthorized from e


CurrentUserDep = Annotated[User, Depends(get_current_user)]


async def get_client_context(user: CurrentUserDep, session: SessionDep) -> ClientContext:
    return await client_context(session, user)


ClientDep = Annotated[ClientContext, Depends(get_client_context)]


async def get_bank_user(user: CurrentUserDep) -> User:
    require_bank(user)
    return user


async def get_underwriter(user: CurrentUserDep) -> User:
    require_underwriter(user)
    return user


async def get_bank_admin(user: CurrentUserDep) -> User:
    require_bank(user, admin=True)
    return user


BankUserDep = Annotated[User, Depends(get_bank_user)]
UnderwriterDep = Annotated[User, Depends(get_underwriter)]
BankAdminDep = Annotated[User, Depends(get_bank_admin)]


def rate_limit(name: str, limit_setting: str) -> Callable:
    async def dependency(request: Request, redis: RedisDep) -> None:
        limit = getattr(settings, limit_setting)
        auth = request.headers.get("authorization", "")
        who = auth[-32:] if auth else (request.client.host if request.client else "unknown")
        key = f"ratelimit:{name}:{who}:{request.url.path}"
        count = await redis.incr(key)
        if count == 1:
            await redis.expire(key, settings.rate_limit_window_seconds)
        if count > limit:
            raise ApiError(429, "TOO_MANY_REQUESTS", "Слишком много попыток, попробуйте через минуту")

    return Depends(dependency)


LoginRateLimit = rate_limit("login", "rate_limit_login")
CodeRateLimit = rate_limit("codes", "rate_limit_codes")
