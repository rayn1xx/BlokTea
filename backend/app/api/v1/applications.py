from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from fastapi import status as http_status

from app.api.deps import ApplicationServiceDep, CurrentUserDep
from app.models import ApplicationStatus
from app.schemas.application import (
    ApplicationListResponse,
    ApplicationSort,
    ApplicationSummary,
    parse_sort,
)
from app.services.applications import ApplicationQuery
from app.services.exceptions import AccessDeniedError

router = APIRouter(tags=["applications"])


@router.get("/applications")
async def list_applications(
    user: CurrentUserDep,
    service: ApplicationServiceDep,
    # ?status=draft&status=info_requested — несколько статусов через повтор параметра
    status: Annotated[list[ApplicationStatus] | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
    sort: ApplicationSort = "-created_at",
) -> ApplicationListResponse:
    sort_field, descending = parse_sort(sort)
    query = ApplicationQuery(
        statuses=status or [], page=page, page_size=page_size, sort_field=sort_field, descending=descending
    )

    try:
        result = await service.list_for_user(user, query)
    except AccessDeniedError as e:
        raise HTTPException(http_status.HTTP_403_FORBIDDEN, "no access") from e

    return ApplicationListResponse(
        items=[ApplicationSummary.from_model(item) for item in result.items],
        page=result.page,
        page_size=result.page_size,
        total=result.total,
    )
