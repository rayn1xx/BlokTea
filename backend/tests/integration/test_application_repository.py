from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories import ApplicationRepository, ApplicationSortField
from app.models import Application, ApplicationStatus, Company, CreditProduct, ProductCode
from tests.factories import make_application, make_company

T0 = datetime(2026, 10, 1, 9, 0, tzinfo=UTC)


@pytest.fixture
def repo(db_session: AsyncSession) -> ApplicationRepository:
    return ApplicationRepository(db_session)


@pytest.fixture
async def company(db_session: AsyncSession) -> Company:
    company = make_company()
    db_session.add(company)
    await db_session.flush()
    return company


async def list_page(repo: ApplicationRepository, company: Company, **params: Any) -> tuple[list[Application], int]:
    defaults: dict[str, Any] = {
        "statuses": [],
        "sort_field": ApplicationSortField.CREATED_AT,
        "descending": True,
        "limit": 100,
        "offset": 0,
    }
    return await repo.list_for_company(company.id, **{**defaults, **params})


async def add_all(repo: ApplicationRepository, *applications: Application) -> None:
    for application in applications:
        await repo.add(application)


async def test_products_are_seeded_by_migration(db_session: AsyncSession) -> None:
    products = (await db_session.scalars(select(CreditProduct))).all()

    assert {p.code for p in products} == {p.value for p in ProductCode}
    assert all(p.name for p in products)


async def test_loads_product(repo: ApplicationRepository, company: Company) -> None:
    await repo.add(make_application(company=company, product_code="overdraft"))

    [loaded], total = await list_page(repo, company)

    assert total == 1
    assert (loaded.product.code, loaded.product.name) == ("overdraft", "Овердрафт")


async def test_does_not_leak_other_companies(
    repo: ApplicationRepository, db_session: AsyncSession, company: Company
) -> None:
    other = make_company()
    db_session.add(other)
    await db_session.flush()
    own = make_application(company=company)
    await add_all(repo, own, make_application(company=other))

    items, total = await list_page(repo, company)

    assert [a.id for a in items] == [own.id]
    assert total == 1


async def test_filter_by_statuses(repo: ApplicationRepository, company: Company) -> None:
    draft = make_application(company=company, status=ApplicationStatus.DRAFT)
    signing = make_application(company=company, status=ApplicationStatus.SIGNING)
    await add_all(repo, draft, signing, make_application(company=company, status=ApplicationStatus.REJECTED))

    items, total = await list_page(repo, company, statuses=[ApplicationStatus.DRAFT, ApplicationStatus.SIGNING])

    assert {a.id for a in items} == {draft.id, signing.id}
    assert total == 2


async def test_empty_statuses_means_all(repo: ApplicationRepository, company: Company) -> None:
    await add_all(repo, *(make_application(company=company, status=s) for s in ApplicationStatus))

    _, total = await list_page(repo, company, statuses=[])

    assert total == len(ApplicationStatus)


@pytest.mark.parametrize("field", list(ApplicationSortField))
@pytest.mark.parametrize("descending", [False, True], ids=["asc", "desc"])
async def test_sorting(
    repo: ApplicationRepository, company: Company, field: ApplicationSortField, descending: bool
) -> None:
    # значения поля идут в обратном порядке к остальным — сортировка по «не тому» полю провалит тест
    apps = [
        make_application(
            company=company,
            created_at=T0 + timedelta(days=i),
            updated_at=T0 + timedelta(days=10 - i),
            requested_amount=(i + 1) * 100_000,
        )
        for i in range(4)
    ]
    await add_all(repo, *apps)

    items, _ = await list_page(repo, company, sort_field=field, descending=descending)

    expected = sorted(apps, key=lambda a: getattr(a, field.value), reverse=descending)
    assert [a.id for a in items] == [a.id for a in expected]


async def test_ties_are_ordered_by_id(repo: ApplicationRepository, company: Company) -> None:
    apps = [make_application(company=company, created_at=T0) for _ in range(5)]
    await add_all(repo, *apps)

    items, _ = await list_page(repo, company, descending=False)

    assert [a.id for a in items] == sorted(a.id for a in apps)


async def test_pagination(repo: ApplicationRepository, company: Company) -> None:
    apps = [make_application(company=company, created_at=T0 + timedelta(hours=i)) for i in range(7)]
    await add_all(repo, *apps)

    pages = [
        (await list_page(repo, company, descending=False, limit=3, offset=offset))
        for offset in (0, 3, 6, 9)
    ]

    assert [[a.id for a in items] for items, _ in pages] == [
        [a.id for a in apps[0:3]],
        [a.id for a in apps[3:6]],
        [apps[6].id],
        [],
    ]
    assert {total for _, total in pages} == {7}


async def test_number_is_unique(repo: ApplicationRepository, company: Company) -> None:
    await repo.add(make_application(company=company, number="КЗ-2026-000001"))

    with pytest.raises(IntegrityError):
        await repo.add(make_application(company=company, number="КЗ-2026-000001"))


async def test_get_by_number(repo: ApplicationRepository, company: Company) -> None:
    application = await repo.add(make_application(company=company))

    assert await repo.get_by_number(application.number) is application
    assert await repo.get_by_number("КЗ-0000-000000") is None


@pytest.mark.parametrize(
    "overrides",
    [
        pytest.param({"requested_amount": 0}, id="zero-amount"),
        pytest.param({"requested_term_months": 0}, id="zero-term"),
        pytest.param({"currency": "rub"}, id="currency-lowercase"),
        pytest.param({"product_code": "mortgage"}, id="unknown-product"),
        pytest.param(
            {"status": ApplicationStatus.IN_REVIEW, "approved_amount": 1_000, "approved_term_months": 12},
            id="approved-terms-before-decision",
        ),
        pytest.param(
            {"status": ApplicationStatus.APPROVED, "approved_amount": None, "approved_term_months": None},
            id="decision-without-approved-terms",
        ),
        pytest.param(
            {"status": ApplicationStatus.ISSUED, "approved_amount": 1_000, "approved_term_months": None},
            id="decision-with-partial-terms",
        ),
        pytest.param(
            {"status": ApplicationStatus.APPROVED, "approved_amount": -1, "approved_term_months": 12},
            id="negative-approved-amount",
        ),
    ],
)
async def test_invalid_application_rejected(
    repo: ApplicationRepository, company: Company, overrides: dict[str, Any]
) -> None:
    with pytest.raises(IntegrityError):
        await repo.add(make_application(company=company, **overrides))


async def test_company_with_applications_cannot_be_deleted(
    repo: ApplicationRepository, db_session: AsyncSession, company: Company
) -> None:
    await repo.add(make_application(company=company))

    await db_session.delete(company)
    with pytest.raises(IntegrityError):
        await db_session.flush()
