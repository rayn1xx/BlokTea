import uuid

import pytest

from app.models import Company, User
from app.services.home import HomeService
from tests.factories import make_account, make_company, make_user
from tests.unit.fakes import FakeAccountRepository, FakeCompanyRepository


@pytest.fixture
def company() -> Company:
    return make_company()


@pytest.fixture
def user(company: Company) -> User:
    return make_user(company_id=company.id)


def make_service(companies: FakeCompanyRepository, accounts: FakeAccountRepository) -> HomeService:
    return HomeService(companies, accounts)


async def test_user_with_company_gets_company_and_all_accounts(company: Company, user: User) -> None:
    company_account = make_account(company=company)
    personal_account = make_account(user=user)
    accounts = FakeAccountRepository(company_account, personal_account)

    data = await make_service(FakeCompanyRepository(company), accounts).get_home(user)

    assert data.user is user
    assert data.company is company
    assert data.accounts == [company_account, personal_account]
    assert accounts.calls == [(user.id, company.id)]


async def test_user_without_company_gets_only_personal_accounts() -> None:
    user = make_user(company_id=None)
    personal_account = make_account(user=user)
    companies = FakeCompanyRepository()
    accounts = FakeAccountRepository(personal_account)

    data = await make_service(companies, accounts).get_home(user)

    assert data.company is None
    assert data.accounts == [personal_account]
    assert accounts.calls == [(user.id, None)]
    assert companies.requested == []


async def test_user_without_role_does_not_see_company(company: Company) -> None:
    user = make_user(company_id=company.id, role=None)
    personal_account = make_account(user=user)
    companies = FakeCompanyRepository(company)
    accounts = FakeAccountRepository(make_account(company=company), personal_account)

    data = await make_service(companies, accounts).get_home(user)

    assert data.company is None
    assert data.accounts == [personal_account]
    assert companies.requested == []


async def test_missing_company_is_treated_as_none() -> None:
    user = make_user(company_id=uuid.uuid4())
    accounts = FakeAccountRepository()

    data = await make_service(FakeCompanyRepository(), accounts).get_home(user)

    assert data.company is None
    assert accounts.calls == [(user.id, None)]


async def test_other_company_accounts_are_not_returned(company: Company, user: User) -> None:
    other_company = make_company()
    accounts = FakeAccountRepository(make_account(company=other_company), make_account(user=make_user()))

    data = await make_service(FakeCompanyRepository(company, other_company), accounts).get_home(user)

    assert data.accounts == []
