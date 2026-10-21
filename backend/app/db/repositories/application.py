import uuid
from collections.abc import Sequence
from enum import StrEnum

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models import Application, ApplicationStatus


class ApplicationSortField(StrEnum):
    CREATED_AT = "created_at"
    UPDATED_AT = "updated_at"
    REQUESTED_AMOUNT = "requested_amount"


SORT_COLUMNS = {
    ApplicationSortField.CREATED_AT: Application.created_at,
    ApplicationSortField.UPDATED_AT: Application.updated_at,
    ApplicationSortField.REQUESTED_AMOUNT: Application.requested_amount,
}


class ApplicationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_for_company(
        self,
        company_id: uuid.UUID,
        *,
        statuses: Sequence[ApplicationStatus],
        sort_field: ApplicationSortField,
        descending: bool,
        limit: int,
        offset: int,
    ) -> tuple[list[Application], int]:
        """Страница заявок компании и общее число заявок под фильтр."""
        filters = [Application.company_id == company_id]
        if statuses:
            filters.append(Application.status.in_(statuses))

        total = await self._session.scalar(select(func.count()).select_from(Application).where(*filters))

        column = SORT_COLUMNS[sort_field]
        # id — второй ключ: при равных значениях порядок стабилен и страницы не пересекаются
        order_by = (column.desc(), Application.id.desc()) if descending else (column.asc(), Application.id.asc())

        result = await self._session.scalars(
            select(Application)
            .options(joinedload(Application.product))
            .where(*filters)
            .order_by(*order_by)
            .limit(limit)
            .offset(offset)
        )
        return list(result), total or 0

    async def get_by_number(self, number: str) -> Application | None:
        return await self._session.scalar(select(Application).where(Application.number == number))

    async def add(self, application: Application) -> Application:
        self._session.add(application)
        await self._session.flush()
        return application
