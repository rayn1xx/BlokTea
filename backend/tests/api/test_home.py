from httpx import AsyncClient

from app.seed import U_ANALYST, U_LES, U_MALKINA, U_NOROLE, U_SMIRNOV
from tests.api.conftest import auth

URL = "/api/v1/home"


async def test_requires_authentication(client: AsyncClient) -> None:
    response = await client.get(URL)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHORIZED"


async def test_owner_home(client: AsyncClient, demo: None) -> None:
    body = (await client.get(URL, headers=auth(U_SMIRNOV))).json()

    assert (body["last_name"], body["first_name"], body["role"], body["home_profile"]) == (
        "Смирнов",
        "Пётр",
        "owner",
        "entrepreneur",
    )
    assert body["permissions"] == ["submit_applications", "upload_documents", "sign", "accept_offers", "manage_team"]
    assert body["company"]["inn"] == "7700000001"
    assert body["company"]["director"] == {"user_id": str(U_SMIRNOV), "name": "Смирнов П. И.", "role": "owner"}
    assert body["accounts"][0]["current_money"] == {"value": 184_250_000, "currency": "RUB"}
    # первый вход собственника открывает онбординг S3
    assert body["onboarding"] == {"completed": False, "progress_percent": 60, "next_step": "registry_confirm"}
    assert body["unread_notifications"] == 2
    assert body["bank_role"] is None


async def test_accountant_gets_accountant_home(client: AsyncClient, demo: None) -> None:
    body = (await client.get(URL, headers=auth(U_MALKINA))).json()

    assert (body["role"], body["home_profile"]) == ("cfo_or_accountant", "accountant")
    assert body["onboarding"]["completed"] is True


async def test_financing_employee_can_apply(client: AsyncClient, demo: None) -> None:
    body = (await client.get(URL, headers=auth(U_LES))).json()

    assert (body["role"], body["home_profile"]) == ("financing_employee", "entrepreneur")


async def test_user_without_role(client: AsyncClient, demo: None) -> None:
    body = (await client.get(URL, headers=auth(U_NOROLE))).json()

    assert (body["role"], body["company"], body["permissions"]) == (None, None, [])


async def test_bank_user(client: AsyncClient, demo: None) -> None:
    body = (await client.get(URL, headers=auth(U_ANALYST))).json()

    assert (body["bank_role"], body["role"]) == ("underwriter", None)


async def test_onboarding_complete(client: AsyncClient, demo: None) -> None:
    confirm = await client.post("/api/v1/company/registry/confirm", headers=auth(U_SMIRNOV), json={"confirmed": False})
    assert confirm.status_code == 422
    assert confirm.json()["error"]["details"] == {"issue_comment": "Обязательное поле"}

    await client.post("/api/v1/company/registry/confirm", headers=auth(U_SMIRNOV), json={"confirmed": True})
    response = await client.post("/api/v1/onboarding/complete", headers=auth(U_SMIRNOV), json={"skipped": False})

    assert response.json() == {"completed": True, "progress_percent": 90, "next_step": None}


async def test_onboarding_only_for_owner(client: AsyncClient, demo: None) -> None:
    response = await client.post("/api/v1/onboarding/complete", headers=auth(U_MALKINA), json={"skipped": True})

    assert response.status_code == 403
    assert response.json()["error"] == {
        "code": "FORBIDDEN_ACTION",
        "message": "Онбординг проходит собственник",
        "details": {"allowed_roles": ["owner"]},
    }
