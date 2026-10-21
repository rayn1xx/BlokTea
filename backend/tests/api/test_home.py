import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_token_factory
from app.models import AccountType, Company, User
from tests.factories import DEFAULT_PASSWORD, make_account, make_company, make_user

HOME = "/api/v1/home"


def auth(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {get_token_factory().create_access_token(user.id)}"}


@pytest.fixture
async def company(db_session: AsyncSession) -> Company:
    company = make_company()
    db_session.add(company)
    await db_session.commit()
    return company


@pytest.fixture
async def member(db_session: AsyncSession, company: Company) -> User:
    user = make_user(company_id=company.id, first_name="Иван", middle_name="Петрович")
    db_session.add(user)
    await db_session.commit()
    return user


async def test_requires_authentication(client: AsyncClient) -> None:
    response = await client.get(HOME)

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


async def test_full_payload(
    client: AsyncClient, db_session: AsyncSession, company: Company, member: User
) -> None:
    primary = make_account(company=company, is_primary=True, name="Основной", current_money=125_000_000)
    personal = make_account(user=member, name=None, current_money=15_420_000)
    db_session.add_all([personal, primary])
    await db_session.commit()

    response = await client.get(HOME, headers=auth(member))

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == str(member.id)
    assert body["first_name"] == "Иван"
    assert body["middle_name"] == "Петрович"
    assert body["birth_date"] is None
    assert body["role"] == "owner"

    assert body["company"]["id"] == str(company.id)
    assert body["company"]["inn"] == company.inn
    assert body["company"]["legal_form"] == "OOO"
    assert body["company"]["okved_additional"] == ["62.02", "63.11"]
    assert body["company"]["verification"] == {"source": "egrul", "verified_at": "2026-10-01T09:00:00Z"}

    assert body["accounts"] == [
        {
            "id": str(primary.id),
            "owner_type": "company",
            "type": "settlement",
            "currency": "RUB",
            "name": "Основной",
            "is_primary": True,
            "current_money": 125_000_000,
        },
        {
            "id": str(personal.id),
            "owner_type": "user",
            "type": "current",
            "currency": "RUB",
            "name": None,
            "is_primary": False,
            "current_money": 15_420_000,
        },
    ]


async def test_user_without_company(client: AsyncClient, user: User, db_session: AsyncSession) -> None:
    personal = make_account(user=user)
    db_session.add(personal)
    await db_session.commit()

    body = (await client.get(HOME, headers=auth(user))).json()

    assert body["company"] is None
    assert [a["id"] for a in body["accounts"]] == [str(personal.id)]


async def test_user_without_role_sees_no_company_data(
    client: AsyncClient, db_session: AsyncSession, company: Company
) -> None:
    no_role = make_user(company_id=company.id, role=None)
    db_session.add(no_role)
    await db_session.flush()
    personal = make_account(user=no_role)
    db_session.add_all([personal, make_account(company=company)])
    await db_session.commit()

    response = await client.get(HOME, headers=auth(no_role))

    assert response.status_code == 200
    body = response.json()
    assert body["role"] is None
    assert body["company"] is None
    assert [a["id"] for a in body["accounts"]] == [str(personal.id)]


async def test_does_not_leak_other_companies(
    client: AsyncClient, db_session: AsyncSession, company: Company, member: User
) -> None:
    other_company = make_company()
    other_user = make_user()
    db_session.add_all([other_company, other_user])
    await db_session.flush()
    db_session.add_all([make_account(company=other_company), make_account(user=other_user)])
    await db_session.commit()

    body = (await client.get(HOME, headers=auth(member))).json()

    assert body["company"]["id"] == str(company.id)
    assert body["accounts"] == []


async def test_colleagues_share_company_accounts_but_not_personal(
    client: AsyncClient, db_session: AsyncSession, company: Company, member: User
) -> None:
    colleague = make_user(company_id=company.id)
    db_session.add(colleague)
    await db_session.flush()
    shared = make_account(company=company, type=AccountType.DEPOSIT)
    colleague_personal = make_account(user=colleague)
    db_session.add_all([shared, colleague_personal])
    await db_session.commit()

    body = (await client.get(HOME, headers=auth(member))).json()

    assert [a["id"] for a in body["accounts"]] == [str(shared.id)]


async def test_with_token_from_login(client: AsyncClient, member: User) -> None:
    login = await client.post("/api/v1/auth/login", json={"login": member.login, "password": DEFAULT_PASSWORD})
    token = login.json()["access_token"]

    response = await client.get(HOME, headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["id"] == str(member.id)
