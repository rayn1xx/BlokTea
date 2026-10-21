import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Company


class CompanyRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_by_id(self, company_id: uuid.UUID) -> Company | None:
        return await self._session.get(Company, company_id)

    async def get_by_inn(self, inn: str) -> Company | None:
        return await self._session.scalar(select(Company).where(Company.inn == inn))

    async def add(self, company: Company) -> Company:
        self._session.add(company)
        await self._session.flush()
        return company
