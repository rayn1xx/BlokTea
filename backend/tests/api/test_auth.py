import pytest
from httpx import AsyncClient, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_token_factory
from app.core.config import settings
from app.models import User
from tests.factories import DEFAULT_PASSWORD, make_user

LOGIN = "/api/v1/auth/login"
REFRESH = "/api/v1/auth/refresh"
LOGOUT = "/api/v1/auth/logout"
COOKIE = settings.refresh_cookie_name


def set_cookie(response: Response) -> str:
    return "\n".join(response.headers.get_list("set-cookie"))


def assert_cookie_deleted(response: Response) -> None:
    header = set_cookie(response)
    assert f"{COOKIE}=" in header
    assert "Max-Age=0" in header
    assert f"Path={settings.refresh_cookie_path}" in header


async def login(client: AsyncClient, user: User, password: str = DEFAULT_PASSWORD) -> Response:
    return await client.post(LOGIN, json={"login": user.login, "password": password})


async def refresh_with(client: AsyncClient, token: str) -> Response:
    # явная cookie вместо банки клиента — чтобы отправить именно этот токен
    client.cookies.clear()
    return await client.post(REFRESH, headers={"Cookie": f"{COOKIE}={token}"})


class TestLogin:
    async def test_success(self, client: AsyncClient, user: User) -> None:
        response = await login(client, user)

        assert response.status_code == 200
        body = response.json()
        assert body.keys() == {"access_token", "token_type", "expires_in"}
        assert body["token_type"] == "Bearer"
        assert body["expires_in"] == settings.access_token_ttl_seconds
        assert get_token_factory().decode_access_token(body["access_token"]) == user.id

    async def test_sets_protected_refresh_cookie(self, client: AsyncClient, user: User) -> None:
        response = await login(client, user)

        header = set_cookie(response)
        assert response.cookies.get(COOKIE)
        assert "HttpOnly" in header
        assert f"Path={settings.refresh_cookie_path}" in header
        assert "samesite=lax" in header.lower()

    async def test_login_is_case_insensitive(self, client: AsyncClient, db_session: AsyncSession) -> None:
        db_session.add(make_user(login="case@test.local"))
        await db_session.commit()

        response = await client.post(LOGIN, json={"login": "  CASE@Test.Local ", "password": DEFAULT_PASSWORD})

        assert response.status_code == 200

    @pytest.mark.parametrize(
        "credentials",
        [
            pytest.param({"password": "wrong-password"}, id="wrong-password"),
            pytest.param({"login": "nobody@test.local"}, id="unknown-login"),
        ],
    )
    async def test_invalid_credentials(self, client: AsyncClient, user: User, credentials: dict) -> None:
        body = {"login": user.login, "password": DEFAULT_PASSWORD, **credentials}

        response = await client.post(LOGIN, json=body)

        assert response.status_code == 401
        # одинаковый ответ — не раскрываем, существует ли логин
        assert response.json() == {"detail": "invalid login or password"}
        assert "set-cookie" not in response.headers

    async def test_inactive_user(self, client: AsyncClient, db_session: AsyncSession) -> None:
        blocked = make_user(is_active=False)
        db_session.add(blocked)
        await db_session.commit()

        assert (await login(client, blocked)).status_code == 401

    async def test_user_without_role_can_login(self, client: AsyncClient, db_session: AsyncSession) -> None:
        no_role = make_user(role=None)
        db_session.add(no_role)
        await db_session.commit()

        assert (await login(client, no_role)).status_code == 200

    @pytest.mark.parametrize(
        "body",
        [
            pytest.param({}, id="empty"),
            pytest.param({"login": "a@test.local"}, id="no-password"),
            pytest.param({"login": "", "password": "x"}, id="empty-login"),
            pytest.param({"login": "a@test.local", "password": ""}, id="empty-password"),
            pytest.param({"login": "a" * 256, "password": "x"}, id="login-too-long"),
        ],
    )
    async def test_validation(self, client: AsyncClient, body: dict) -> None:
        assert (await client.post(LOGIN, json=body)).status_code == 422


class TestRefresh:
    async def test_rotates_tokens(self, client: AsyncClient, user: User) -> None:
        first = (await login(client, user)).cookies[COOKIE]

        response = await client.post(REFRESH)

        assert response.status_code == 200
        assert get_token_factory().decode_access_token(response.json()["access_token"]) == user.id
        second = response.cookies[COOKIE]
        assert second != first
        assert (await refresh_with(client, second)).status_code == 200

    async def test_without_cookie(self, client: AsyncClient) -> None:
        response = await client.post(REFRESH)

        assert response.status_code == 401
        assert response.json() == {"detail": "invalid refresh token"}
        assert_cookie_deleted(response)

    async def test_unknown_token(self, client: AsyncClient) -> None:
        response = await refresh_with(client, "not-a-real-token")

        assert response.status_code == 401
        assert_cookie_deleted(response)

    async def test_reuse_revokes_all_sessions(self, client: AsyncClient, user: User) -> None:
        stolen = (await login(client, user)).cookies[COOKIE]
        current = (await refresh_with(client, stolen)).cookies[COOKIE]

        reuse = await refresh_with(client, stolen)

        assert reuse.status_code == 401
        assert_cookie_deleted(reuse)
        assert (await refresh_with(client, current)).status_code == 401

    async def test_other_devices_survive_reuse_of_another_user(
        self, client: AsyncClient, user: User, db_session: AsyncSession
    ) -> None:
        other = make_user()
        db_session.add(other)
        await db_session.commit()
        other_token = (await login(client, other)).cookies[COOKIE]
        stolen = (await login(client, user)).cookies[COOKIE]
        await refresh_with(client, stolen)

        await refresh_with(client, stolen)

        assert (await refresh_with(client, other_token)).status_code == 200

    async def test_deactivated_user(self, client: AsyncClient, user: User, db_session: AsyncSession) -> None:
        token = (await login(client, user)).cookies[COOKIE]
        user.is_active = False
        db_session.add(user)
        await db_session.commit()

        assert (await refresh_with(client, token)).status_code == 401


class TestLogout:
    async def test_revokes_session_and_deletes_cookie(self, client: AsyncClient, user: User) -> None:
        token = (await login(client, user)).cookies[COOKIE]

        response = await client.post(LOGOUT)

        assert response.status_code == 204
        assert_cookie_deleted(response)
        assert (await refresh_with(client, token)).status_code == 401

    async def test_does_not_affect_other_sessions(self, client: AsyncClient, user: User) -> None:
        first = (await login(client, user)).cookies[COOKIE]
        second = (await login(client, user)).cookies[COOKIE]

        client.cookies.clear()
        await client.post(LOGOUT, headers={"Cookie": f"{COOKIE}={first}"})

        assert (await refresh_with(client, second)).status_code == 200

    @pytest.mark.parametrize("cookie", [None, "unknown-token"])
    async def test_without_valid_session(self, client: AsyncClient, cookie: str | None) -> None:
        headers = {"Cookie": f"{COOKIE}={cookie}"} if cookie else {}

        response = await client.post(LOGOUT, headers=headers)

        assert response.status_code == 204
        assert_cookie_deleted(response)

    async def test_works_without_access_token(self, client: AsyncClient, user: User) -> None:
        await login(client, user)

        response = await client.post(LOGOUT, headers={"Authorization": "Bearer expired-or-garbage"})

        assert response.status_code == 204


async def test_full_session_lifecycle(client: AsyncClient, user: User) -> None:
    assert (await login(client, user)).status_code == 200
    assert (await client.post(REFRESH)).status_code == 200
    assert (await client.post(REFRESH)).status_code == 200
    assert (await client.post(LOGOUT)).status_code == 204
    assert (await client.post(REFRESH)).status_code == 401
