"""get_current_user проверяется на тестовом приложении: защищённых роутов в API пока нет."""

import uuid
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUserDep, get_token_factory
from app.models import User
from tests.api.conftest import ClientFactory
from tests.factories import DEFAULT_PASSWORD

protected_app = FastAPI()


@protected_app.get("/me")
async def me(user: CurrentUserDep) -> dict[str, str]:
    return {"id": str(user.id)}


@pytest.fixture
async def protected(make_client: ClientFactory) -> AsyncIterator[AsyncClient]:
    async with make_client(protected_app) as client:
        yield client


def bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


async def test_valid_token(protected: AsyncClient, user: User) -> None:
    token = get_token_factory().create_access_token(user.id)

    response = await protected.get("/me", headers=bearer(token))

    assert response.status_code == 200
    assert response.json() == {"id": str(user.id)}


async def test_token_from_login_endpoint(protected: AsyncClient, client: AsyncClient, user: User) -> None:
    login = await client.post("/api/v1/auth/login", json={"login": user.login, "password": DEFAULT_PASSWORD})

    response = await protected.get("/me", headers=bearer(login.json()["access_token"]))

    assert response.status_code == 200


@pytest.mark.parametrize(
    "headers",
    [
        pytest.param({}, id="no-header"),
        pytest.param({"Authorization": "Basic dXNlcjpwYXNz"}, id="wrong-scheme"),
        pytest.param(bearer("garbage"), id="garbage"),
    ],
)
async def test_rejected_headers(protected: AsyncClient, headers: dict) -> None:
    response = await protected.get("/me", headers=headers)

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


async def test_expired_token(protected: AsyncClient, user: User) -> None:
    token = get_token_factory().create_access_token(user.id, datetime.now(UTC) - timedelta(hours=1))

    assert (await protected.get("/me", headers=bearer(token))).status_code == 401


async def test_unknown_user(protected: AsyncClient) -> None:
    token = get_token_factory().create_access_token(uuid.uuid4())

    assert (await protected.get("/me", headers=bearer(token))).status_code == 401


async def test_deactivated_user(protected: AsyncClient, user: User, db_session: AsyncSession) -> None:
    token = get_token_factory().create_access_token(user.id)
    user.is_active = False
    db_session.add(user)
    await db_session.commit()

    assert (await protected.get("/me", headers=bearer(token))).status_code == 401
