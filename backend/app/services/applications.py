from dataclasses import dataclass, field

from app.db.repositories import ApplicationRepository, ApplicationSortField
from app.models import Application, ApplicationStatus, User
from app.services.exceptions import AccessDeniedError


@dataclass(frozen=True)
class ApplicationQuery:
    statuses: list[ApplicationStatus] = field(default_factory=list)
    page: int = 1  # с 1
    page_size: int = 10
    sort_field: ApplicationSortField = ApplicationSortField.CREATED_AT
    descending: bool = True


@dataclass(frozen=True)
class ApplicationPage:
    items: list[Application]
    page: int
    page_size: int
    total: int


class ApplicationService:
    def __init__(self, applications: ApplicationRepository) -> None:
        self._applications = applications

    async def list_for_user(self, user: User, query: ApplicationQuery) -> ApplicationPage:
        # без роли доступа к данным компании нет
        if user.role is None:
            raise AccessDeniedError

        if user.company_id is None:
            return ApplicationPage(items=[], page=query.page, page_size=query.page_size, total=0)

        items, total = await self._applications.list_for_company(
            user.company_id,
            statuses=query.statuses,
            sort_field=query.sort_field,
            descending=query.descending,
            limit=query.page_size,
            offset=(query.page - 1) * query.page_size,
        )
        return ApplicationPage(items=items, page=query.page, page_size=query.page_size, total=total)
