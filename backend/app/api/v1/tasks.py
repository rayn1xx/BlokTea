import uuid
from typing import Literal

from fastapi import APIRouter

from app.api.deps import ClientDep, SessionDep, TaskServiceDep
from app.schemas.contracts import MemberIdRequest, Task

router = APIRouter(tags=["tasks"])


@router.get("/tasks")
async def tasks(
    ctx: ClientDep, service: TaskServiceDep, scope: Literal["mine", "waiting_others", "all"] = "all"
) -> list[Task]:
    return await service.list(ctx, scope)


@router.post("/tasks/{task_id}/reassign")
async def reassign(
    task_id: uuid.UUID, body: MemberIdRequest, ctx: ClientDep, service: TaskServiceDep, session: SessionDep
) -> Task:
    result = await service.reassign(ctx, task_id, body.member_id)
    await session.commit()
    return result
