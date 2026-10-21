import uuid

import pytest

from app.db.repositories import ApplicationSortField
from app.models import ApplicationStatus
from app.services.applications import ApplicationQuery, ApplicationService
from app.services.exceptions import AccessDeniedError
from tests.factories import make_application, make_company, make_user
from tests.unit.fakes import FakeApplicationRepository


async def test_passes_query_to_repository() -> None:
    company = make_company()
    user = make_user(company_id=company.id)
    repo = FakeApplicationRepository()
    query = ApplicationQuery(
        statuses=[ApplicationStatus.DRAFT, ApplicationStatus.SIGNING],
        page=3,
        page_size=20,
        sort_field=ApplicationSortField.REQUESTED_AMOUNT,
        descending=False,
    )

    await ApplicationService(repo).list_for_user(user, query)

    assert repo.calls == [
        {
            "company_id": company.id,
            "statuses": [ApplicationStatus.DRAFT, ApplicationStatus.SIGNING],
            "sort_field": ApplicationSortField.REQUESTED_AMOUNT,
            "descending": False,
            "limit": 20,
            "offset": 40,
        }
    ]


async def test_returns_page_with_total_from_repository() -> None:
    company = make_company()
    items = [make_application(company=company), make_application(company=company)]
    repo = FakeApplicationRepository(*items, total=57)

    page = await ApplicationService(repo).list_for_user(
        make_user(company_id=company.id), ApplicationQuery(page=2, page_size=2)
    )

    assert (page.items, page.page, page.page_size, page.total) == (items, 2, 2, 57)


async def test_defaults_newest_first() -> None:
    repo = FakeApplicationRepository()

    await ApplicationService(repo).list_for_user(make_user(company_id=uuid.uuid4()), ApplicationQuery())

    call = repo.calls[0]
    assert (call["sort_field"], call["descending"], call["limit"], call["offset"]) == (
        ApplicationSortField.CREATED_AT,
        True,
        10,
        0,
    )


async def test_user_without_role_is_denied() -> None:
    repo = FakeApplicationRepository()

    with pytest.raises(AccessDeniedError):
        await ApplicationService(repo).list_for_user(
            make_user(company_id=uuid.uuid4(), role=None), ApplicationQuery()
        )

    assert repo.calls == []


async def test_user_without_company_gets_empty_page() -> None:
    repo = FakeApplicationRepository(make_application(company=make_company()))

    page = await ApplicationService(repo).list_for_user(
        make_user(company_id=None), ApplicationQuery(page=2, page_size=5)
    )

    assert (page.items, page.page, page.page_size, page.total) == ([], 2, 5, 0)
    assert repo.calls == []
