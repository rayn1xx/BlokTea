from typing import Any

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories import AccountRepository
from app.models import Account, AccountOwnerType, AccountType, Company, User
from tests.factories import make_account, make_company, make_user


@pytest.fixture
def repo(db_session: AsyncSession) -> AccountRepository:
    return AccountRepository(db_session)


@pytest.fixture
async def company(db_session: AsyncSession) -> Company:
    company = make_company()
    db_session.add(company)
    await db_session.flush()
    return company


@pytest.fixture
async def member(db_session: AsyncSession, company: Company) -> User:
    user = make_user(company_id=company.id)
    db_session.add(user)
    await db_session.flush()
    return user


async def add_all(repo: AccountRepository, *accounts: Account) -> None:
    for account in accounts:
        await repo.add(account)


async def test_lists_personal_and_company_accounts(
    repo: AccountRepository, company: Company, member: User
) -> None:
    company_account = make_account(company=company)
    personal_account = make_account(user=member)
    await add_all(repo, company_account, personal_account)

    accounts = await repo.list_for_owner(member.id, company.id)

    assert {a.id for a in accounts} == {company_account.id, personal_account.id}


async def test_without_company_lists_only_personal(
    repo: AccountRepository, company: Company, member: User
) -> None:
    personal_account = make_account(user=member)
    await add_all(repo, make_account(company=company), personal_account)

    accounts = await repo.list_for_owner(member.id, None)

    assert [a.id for a in accounts] == [personal_account.id]


async def test_does_not_leak_foreign_accounts(
    repo: AccountRepository, db_session: AsyncSession, company: Company, member: User
) -> None:
    other_company = make_company()
    other_user = make_user()
    db_session.add_all([other_company, other_user])
    await db_session.flush()
    await add_all(repo, make_account(company=other_company), make_account(user=other_user))

    assert await repo.list_for_owner(member.id, company.id) == []


async def test_order_primary_then_company_then_personal(
    repo: AccountRepository, company: Company, member: User
) -> None:
    personal = make_account(user=member)
    company_secondary = make_account(company=company, type=AccountType.DEPOSIT)
    company_primary = make_account(company=company, is_primary=True)
    await add_all(repo, personal, company_secondary, company_primary)

    accounts = await repo.list_for_owner(member.id, company.id)

    assert [a.id for a in accounts] == [company_primary.id, company_secondary.id, personal.id]


@pytest.mark.parametrize(
    "overrides",
    [
        pytest.param({"owner_type": AccountOwnerType.USER}, id="company-account-marked-as-user"),
        pytest.param({"user_id": "member"}, id="two-owners"),
        pytest.param({"company_id": None}, id="no-owner"),
        pytest.param({"currency": "rub"}, id="currency-lowercase"),
        pytest.param({"currency": "RU"}, id="currency-too-short"),
    ],
)
async def test_invalid_account_rejected(
    repo: AccountRepository, company: Company, member: User, overrides: dict[str, Any]
) -> None:
    if overrides.get("user_id") == "member":
        overrides["user_id"] = member.id

    with pytest.raises(IntegrityError):
        await repo.add(make_account(company=company, **overrides))


async def test_deleting_company_deletes_its_accounts(
    repo: AccountRepository, db_session: AsyncSession, company: Company, member: User
) -> None:
    personal = make_account(user=member)
    await add_all(repo, make_account(company=company), personal)

    await db_session.delete(company)
    await db_session.flush()

    assert [a.id for a in await repo.list_for_owner(member.id, company.id)] == [personal.id]


async def test_balance_supports_large_and_negative_values(repo: AccountRepository, member: User) -> None:
    # BIGINT: 10 млрд рублей в копейках не влезли бы в INTEGER
    big = make_account(user=member, current_money=1_000_000_000_000)
    debt = make_account(user=member, type=AccountType.CREDIT, current_money=-50_000)
    await add_all(repo, big, debt)

    balances = {a.id: a.current_money for a in await repo.list_for_owner(member.id, None)}

    assert balances == {big.id: 1_000_000_000_000, debt.id: -50_000}
