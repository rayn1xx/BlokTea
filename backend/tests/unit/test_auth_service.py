import uuid
from datetime import timedelta

import pytest

from app.core.security import PasswordHasher, TokenFactory
from app.models import User
from app.services.auth import AuthService, normalize_login
from app.services.exceptions import (
    InvalidCredentialsError,
    InvalidRefreshTokenError,
    NotAuthenticatedError,
)
from tests.factories import DEFAULT_PASSWORD, make_user
from tests.unit.fakes import FakeRefreshSessionRepository, FakeSession, FakeUserRepository

ACCESS_TTL = timedelta(minutes=15)
REFRESH_TTL = timedelta(days=30)


class Context:
    def __init__(self, *users: User) -> None:
        self.session = FakeSession()
        self.users = FakeUserRepository(*users)
        self.refresh_sessions = FakeRefreshSessionRepository()
        self.hasher = PasswordHasher()
        self.tokens = TokenFactory("unit-secret", "HS256", ACCESS_TTL, REFRESH_TTL)
        self.service = AuthService(self.session, self.users, self.refresh_sessions, self.hasher, self.tokens)


@pytest.fixture
def user() -> User:
    return make_user(login="owner@test.local")


@pytest.fixture
def ctx(user: User) -> Context:
    return Context(user)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [("owner@test.local", "owner@test.local"), ("  Owner@Test.LOCAL\t", "owner@test.local")],
)
def test_normalize_login(raw: str, expected: str) -> None:
    assert normalize_login(raw) == expected


class TestLogin:
    async def test_issues_tokens(self, ctx: Context, user: User) -> None:
        issued = await ctx.service.login("owner@test.local", DEFAULT_PASSWORD)

        assert ctx.tokens.decode_access_token(issued.access_token) == user.id
        assert issued.expires_in == ACCESS_TTL.total_seconds()
        assert issued.refresh_token

    async def test_stores_only_hash_of_refresh_token(self, ctx: Context, user: User) -> None:
        issued = await ctx.service.login("owner@test.local", DEFAULT_PASSWORD)

        token_hash = ctx.tokens.hash_refresh_token(issued.refresh_token)
        assert ctx.refresh_sessions.sessions == {
            token_hash: {"user_id": user.id, "revoked": False, "ttl": REFRESH_TTL}
        }

    async def test_login_is_normalized(self, ctx: Context) -> None:
        await ctx.service.login("  OWNER@test.local ", DEFAULT_PASSWORD)

    async def test_wrong_password(self, ctx: Context) -> None:
        with pytest.raises(InvalidCredentialsError):
            await ctx.service.login("owner@test.local", "wrong")

    async def test_unknown_login(self, ctx: Context) -> None:
        with pytest.raises(InvalidCredentialsError):
            await ctx.service.login("nobody@test.local", DEFAULT_PASSWORD)

    async def test_inactive_user(self) -> None:
        ctx = Context(make_user(login="blocked@test.local", is_active=False))

        with pytest.raises(InvalidCredentialsError):
            await ctx.service.login("blocked@test.local", DEFAULT_PASSWORD)

    async def test_failed_login_creates_no_session(self, ctx: Context) -> None:
        with pytest.raises(InvalidCredentialsError):
            await ctx.service.login("owner@test.local", "wrong")

        assert ctx.refresh_sessions.sessions == {}

    async def test_outdated_hash_is_rehashed(self, ctx: Context, user: User, monkeypatch) -> None:
        old_hash = user.password_hash
        monkeypatch.setattr(ctx.hasher, "needs_rehash", lambda _: True)

        await ctx.service.login("owner@test.local", DEFAULT_PASSWORD)

        assert user.password_hash != old_hash
        assert ctx.hasher.verify(user.password_hash, DEFAULT_PASSWORD)
        assert ctx.session.commits == 1

    async def test_no_commit_when_hash_is_current(self, ctx: Context) -> None:
        await ctx.service.login("owner@test.local", DEFAULT_PASSWORD)

        assert ctx.session.commits == 0


class TestRefresh:
    @pytest.mark.parametrize("token", [None, ""])
    async def test_empty_token(self, ctx: Context, token: str | None) -> None:
        with pytest.raises(InvalidRefreshTokenError):
            await ctx.service.refresh(token)

    async def test_unknown_token(self, ctx: Context) -> None:
        with pytest.raises(InvalidRefreshTokenError):
            await ctx.service.refresh("unknown")

    async def test_rotates_tokens(self, ctx: Context, user: User) -> None:
        first = await ctx.service.login("owner@test.local", DEFAULT_PASSWORD)

        second = await ctx.service.refresh(first.refresh_token)

        assert second.refresh_token != first.refresh_token
        assert ctx.tokens.decode_access_token(second.access_token) == user.id
        assert ctx.refresh_sessions.sessions[ctx.tokens.hash_refresh_token(first.refresh_token)]["revoked"]
        assert not ctx.refresh_sessions.sessions[ctx.tokens.hash_refresh_token(second.refresh_token)]["revoked"]

    async def test_reuse_revokes_all_user_sessions(self, ctx: Context, user: User) -> None:
        first = await ctx.service.login("owner@test.local", DEFAULT_PASSWORD)
        second = await ctx.service.refresh(first.refresh_token)

        with pytest.raises(InvalidRefreshTokenError):
            await ctx.service.refresh(first.refresh_token)

        assert ctx.refresh_sessions.revoked_users == [user.id]
        with pytest.raises(InvalidRefreshTokenError):
            await ctx.service.refresh(second.refresh_token)

    async def test_inactive_user(self, ctx: Context, user: User) -> None:
        issued = await ctx.service.login("owner@test.local", DEFAULT_PASSWORD)
        user.is_active = False

        with pytest.raises(InvalidRefreshTokenError):
            await ctx.service.refresh(issued.refresh_token)

    async def test_deleted_user(self, ctx: Context, user: User) -> None:
        issued = await ctx.service.login("owner@test.local", DEFAULT_PASSWORD)
        del ctx.users.users[user.id]

        with pytest.raises(InvalidRefreshTokenError):
            await ctx.service.refresh(issued.refresh_token)


class TestLogout:
    async def test_deletes_session(self, ctx: Context) -> None:
        issued = await ctx.service.login("owner@test.local", DEFAULT_PASSWORD)

        await ctx.service.logout(issued.refresh_token)

        assert ctx.refresh_sessions.sessions == {}
        with pytest.raises(InvalidRefreshTokenError):
            await ctx.service.refresh(issued.refresh_token)

    @pytest.mark.parametrize("token", [None, "", "unknown"])
    async def test_without_valid_token_is_noop(self, ctx: Context, token: str | None) -> None:
        await ctx.service.logout(token)


class TestAuthenticate:
    async def test_returns_user(self, ctx: Context, user: User) -> None:
        token = ctx.tokens.create_access_token(user.id)

        assert await ctx.service.authenticate(token) is user

    async def test_invalid_token(self, ctx: Context) -> None:
        with pytest.raises(NotAuthenticatedError):
            await ctx.service.authenticate("garbage")

    async def test_unknown_user(self, ctx: Context) -> None:
        with pytest.raises(NotAuthenticatedError):
            await ctx.service.authenticate(ctx.tokens.create_access_token(uuid.uuid4()))

    async def test_inactive_user(self, ctx: Context, user: User) -> None:
        user.is_active = False

        with pytest.raises(NotAuthenticatedError):
            await ctx.service.authenticate(ctx.tokens.create_access_token(user.id))
