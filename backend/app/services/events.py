import uuid
from collections.abc import Iterable

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import invalid_transition
from app.domain.catalog import STATUS_TITLES
from app.domain.state_machine import can_transition
from app.models import Application, ApplicationEvent, ApplicationStatus, AuditLog, Notification, Task
from app.services.common import now

STATUS_EVENT_TITLES = {
    "draft": "Заявка создана",
    "submitted": "Заявка отправлена в банк",
    "in_review": "Заявка на рассмотрении",
    "info_requested": "Банк запросил информацию",
    "approved": "Заявка одобрена",
    "counter_offer": "Банк предложил другие условия",
    "rejected": "Решение банка",
    "signing": "Предложение принято",
    "issued": "Кредит выдан",
    "cancelled": "Заявка отозвана",
}


class Actor:
    def __init__(self, type_: str, user_id: uuid.UUID | None = None, name: str | None = None) -> None:
        self.type = type_
        self.user_id = user_id
        self.name = name

    @property
    def audit_name(self) -> str:
        return self.name or {"system": "Система", "bank": "Банк", "client": "Клиент"}[self.type]


SYSTEM = Actor("system")


def add_event(
    session: AsyncSession,
    app: Application,
    *,
    title: str,
    actor: Actor,
    description: str | None = None,
    from_status: str | None = None,
    payload: dict | None = None,
) -> ApplicationEvent:
    event = ApplicationEvent(
        application_id=app.id,
        from_status=from_status,
        to_status=app.status.value,
        actor_type=actor.type,
        actor_id=actor.user_id,
        actor_name=actor.name,
        title=title,
        description=description,
        payload=payload or {},
        at=now(),
    )
    session.add(event)
    return event


def audit(
    session: AsyncSession,
    *,
    actor: Actor,
    action: str,
    entity: str,
    entity_id: uuid.UUID | str | None,
    details: str | None = None,
) -> None:
    session.add(
        AuditLog(
            at=now(),
            actor=actor.audit_name,
            actor_id=actor.user_id,
            action=action,
            entity=entity,
            entity_id=str(entity_id) if entity_id else None,
            details=details,
        )
    )


def notify(
    session: AsyncSession,
    user_ids: Iterable[uuid.UUID | None],
    *,
    title: str,
    text: str,
    application_id: uuid.UUID | None = None,
    route: str | None = None,
) -> None:
    for user_id in dict.fromkeys(u for u in user_ids if u):
        session.add(
            Notification(
                user_id=user_id,
                created_at=now(),
                read=False,
                title=title,
                text=text,
                application_id=application_id,
                route=route,
            )
        )


def transition(
    session: AsyncSession,
    app: Application,
    target: ApplicationStatus,
    actor: Actor,
    *,
    title: str | None = None,
    description: str | None = None,
    notify_users: Iterable[uuid.UUID | None] = (),
    notification_text: str | None = None,
) -> None:
    current = app.status.value
    if not can_transition(current, target.value):
        raise invalid_transition(
            f"Заявку в статусе {STATUS_TITLES[current]} нельзя перевести в статус {STATUS_TITLES[target.value]}"
        )
    app.status = target
    app.version += 1
    app.updated_at = now()
    event_title = title or STATUS_EVENT_TITLES[target.value]
    add_event(session, app, title=event_title, actor=actor, description=description, from_status=current)
    audit(
        session,
        actor=actor,
        action=f"Статус: {current} → {target.value}",
        entity="application",
        entity_id=app.id,
        details=description,
    )
    notify(
        session,
        notify_users,
        title=f"{event_title}: {app.number}",
        text=notification_text or description or event_title,
        application_id=app.id,
        route=f"/applications/{app.id}",
    )


def add_task(
    session: AsyncSession,
    *,
    company_id: uuid.UUID,
    type_: str,
    title: str,
    cta: dict,
    assignee: uuid.UUID | None,
    application_id: uuid.UUID | None = None,
    ref_id: str | None = None,
    due_at=None,
) -> Task:
    task = Task(
        company_id=company_id,
        type=type_,
        title=title,
        cta=cta,
        assignee_user_id=assignee,
        application_id=application_id,
        ref_id=ref_id,
        due_at=due_at,
        status="open",
        created_at=now(),
    )
    session.add(task)
    return task


async def close_tasks(
    session: AsyncSession,
    *,
    application_id: uuid.UUID | None = None,
    types: Iterable[str] | None = None,
    ref_id: str | None = None,
    assignee: uuid.UUID | None = None,
) -> None:
    filters = [Task.status == "open"]
    if application_id:
        filters.append(Task.application_id == application_id)
    if types:
        filters.append(Task.type.in_(list(types)))
    if ref_id:
        filters.append(Task.ref_id == ref_id)
    if assignee:
        filters.append(Task.assignee_user_id == assignee)
    await session.execute(update(Task).where(*filters).values(status="done", closed_at=now()))


async def open_tasks(session: AsyncSession, application_id: uuid.UUID, type_: str) -> list[Task]:
    return list(
        await session.scalars(
            select(Task).where(Task.application_id == application_id, Task.type == type_, Task.status == "open")
        )
    )
