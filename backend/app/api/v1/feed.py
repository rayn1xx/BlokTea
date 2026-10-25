import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import ClientDep, CurrentUserDep, FeedServiceDep, SessionDep
from app.schemas.contracts import FeedItem, Notification, Paginated

router = APIRouter(tags=["feed"])


@router.get("/feed")
async def feed(
    ctx: ClientDep,
    service: FeedServiceDep,
    type: str | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> Paginated[FeedItem]:
    return await service.feed(ctx, type, page, page_size)


@router.get("/notifications")
async def notifications(user: CurrentUserDep, service: FeedServiceDep, unread: bool = False) -> list[Notification]:
    return await service.notifications(user, unread)


@router.post("/notifications/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def read_all(user: CurrentUserDep, service: FeedServiceDep, session: SessionDep) -> None:
    await service.read_all(user)
    await session.commit()


@router.post("/notifications/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def read(notification_id: uuid.UUID, user: CurrentUserDep, service: FeedServiceDep, session: SessionDep) -> None:
    await service.read(user, notification_id)
    await session.commit()
