from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_token_factory
from app.models import Application, ApplicationStatus, Company, User
from tests.factories import make_application, make_company, make_user

URL = "/api/v1/applications"
T0 = datetime(2026, 10, 1, 9, 0, tzinfo=UTC)


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
    user = make_user(company_id=company.id)
    db_session.add(user)
    await db_session.commit()
    return user


async def add(db_session: AsyncSession, *applications: Application) -> None:
    db_session.add_all(applications)
    await db_session.commit()


def ids(response) -> list[str]:
    return [item["id"] for item in response.json()["items"]]


async def test_requires_authentication(client: AsyncClient) -> None:
    assert (await client.get(URL)).status_code == 401


async def test_user_without_role_is_forbidden(
    client: AsyncClient, db_session: AsyncSession, company: Company
) -> None:
    no_role = make_user(company_id=company.id, role=None)
    db_session.add(no_role)
    await db_session.commit()

    response = await client.get(URL, headers=auth(no_role))

    assert response.status_code == 403
    assert response.json() == {"detail": "no access"}


async def test_user_without_company_gets_empty_list(client: AsyncClient, user: User) -> None:
    response = await client.get(URL, headers=auth(user))

    assert response.status_code == 200
    assert response.json() == {"items": [], "page": 1, "page_size": 10, "total": 0}


async def test_item_payload(
    client: AsyncClient, db_session: AsyncSession, company: Company, member: User
) -> None:
    application = make_application(
        company=company,
        number="КЗ-2026-001279",
        product_code="investment",
        purpose="Покупка фрезерного станка",
        requested_amount=850_000_000,
        requested_term_months=36,
        approved_amount=700_000_000,
        approved_term_months=36,
        status=ApplicationStatus.COUNTER_OFFER,
        required_action="Посмотрите предложение банка и примите решение",
        created_at=T0,
        updated_at=T0 + timedelta(days=4),
    )
    await add(db_session, application)

    response = await client.get(URL, headers=auth(member))

    assert response.status_code == 200
    assert response.json() == {
        "items": [
            {
                "id": str(application.id),
                "number": "КЗ-2026-001279",
                "product": {"code": "investment", "name": "Кредит на оборудование"},
                "purpose": "Покупка фрезерного станка",
                "requested_amount": {"value": 850_000_000, "currency": "RUB"},
                "requested_term_months": 36,
                "approved_amount": {"value": 700_000_000, "currency": "RUB"},
                "approved_term_months": 36,
                "status": "counter_offer",
                "required_action": "Посмотрите предложение банка и примите решение",
                "created_at": "2026-10-01T09:00:00Z",
                "updated_at": "2026-10-05T09:00:00Z",
            }
        ],
        "page": 1,
        "page_size": 10,
        "total": 1,
    }


async def test_defaults_newest_first_ten_per_page(
    client: AsyncClient, db_session: AsyncSession, company: Company, member: User
) -> None:
    apps = [make_application(company=company, created_at=T0 + timedelta(days=i)) for i in range(12)]
    await add(db_session, *apps)

    response = await client.get(URL, headers=auth(member))

    body = response.json()
    assert (body["page"], body["page_size"], body["total"]) == (1, 10, 12)
    assert ids(response) == [str(a.id) for a in reversed(apps)][:10]


async def test_filter_by_several_statuses(
    client: AsyncClient, db_session: AsyncSession, company: Company, member: User
) -> None:
    # вкладка «В банке» на фронте
    submitted = make_application(company=company, status=ApplicationStatus.SUBMITTED)
    in_review = make_application(company=company, status=ApplicationStatus.IN_REVIEW)
    await add(db_session, submitted, in_review, make_application(company=company, status=ApplicationStatus.ISSUED))

    response = await client.get(URL, params=[("status", "submitted"), ("status", "in_review")], headers=auth(member))

    assert set(ids(response)) == {str(submitted.id), str(in_review.id)}
    assert response.json()["total"] == 2


async def test_sort_and_pagination(
    client: AsyncClient, db_session: AsyncSession, company: Company, member: User
) -> None:
    apps = [make_application(company=company, requested_amount=(i + 1) * 100_000) for i in range(5)]
    await add(db_session, *apps)

    response = await client.get(
        URL, params={"sort": "requested_amount", "page": 2, "page_size": 2}, headers=auth(member)
    )

    body = response.json()
    assert (body["page"], body["page_size"], body["total"]) == (2, 2, 5)
    assert ids(response) == [str(apps[2].id), str(apps[3].id)]


async def test_page_beyond_last_is_empty(
    client: AsyncClient, db_session: AsyncSession, company: Company, member: User
) -> None:
    await add(db_session, make_application(company=company))

    response = await client.get(URL, params={"page": 5}, headers=auth(member))

    assert response.status_code == 200
    assert response.json() == {"items": [], "page": 5, "page_size": 10, "total": 1}


async def test_does_not_leak_other_companies(
    client: AsyncClient, db_session: AsyncSession, company: Company, member: User
) -> None:
    other = make_company()
    db_session.add(other)
    await db_session.flush()
    own = make_application(company=company)
    await add(db_session, own, make_application(company=other))

    response = await client.get(URL, headers=auth(member))

    assert ids(response) == [str(own.id)]


@pytest.mark.parametrize(
    "params",
    [
        pytest.param({"status": "unknown"}, id="unknown-status"),
        pytest.param({"page": 0}, id="page-zero"),
        pytest.param({"page": "abc"}, id="page-not-int"),
        pytest.param({"page_size": 0}, id="page-size-zero"),
        pytest.param({"page_size": 101}, id="page-size-too-big"),
        pytest.param({"sort": "number"}, id="unknown-sort"),
        pytest.param({"sort": "--created_at"}, id="double-minus"),
    ],
)
async def test_invalid_params(client: AsyncClient, member: User, params: dict) -> None:
    assert (await client.get(URL, params=params, headers=auth(member))).status_code == 422
