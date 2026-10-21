from dataclasses import dataclass

from app.db.repositories import AccountRepository, CompanyRepository
from app.models import Account, Company, User


@dataclass(frozen=True)
class HomeData:
    user: User
    company: Company | None
    accounts: list[Account]


class HomeService:
    def __init__(self, companies: CompanyRepository, accounts: AccountRepository) -> None:
        self._companies = companies
        self._accounts = accounts

    async def get_home(self, user: User) -> HomeData:
        # без роли доступа к данным компании нет — отдаём только личное
        company = None
        if user.role is not None and user.company_id is not None:
            company = await self._companies.get_by_id(user.company_id)

        accounts = await self._accounts.list_for_owner(user.id, company.id if company else None)
        return HomeData(user=user, company=company, accounts=accounts)
