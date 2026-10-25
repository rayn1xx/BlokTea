import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import not_found, validation
from app.models import Application, Task
from app.services.common import ClientContext, People, iso

TASK_PERMISSION = {
    "info_request": "upload_documents",
    "send_application": "submit_applications",
    "accept_offer": "accept_offers",
    "approve_member": "manage_team",
    "sign": "sign",
    "consent": "sign",
    "upload_document": "upload_documents",
}
REASSIGNABLE = {"info_request", "send_application", "upload_document"}

WAITING_PREFIX = {
    "accept_offer": "Решение принимает",
    "sign": "Подписывает",
}


def task_view(task: Task, ctx: ClientContext, people: People, apps: dict[uuid.UUID, Application]) -> dict:
    app = apps.get(task.application_id) if task.application_id else None
    mine = task.assignee_user_id == ctx.user.id
    can_reassign = task.type in REASSIGNABLE and (mine or ctx.has("manage_team"))
    waiting = None
    if task.assignee_user_id and not mine:
        waiting = f"{WAITING_PREFIX.get(task.type, 'Ждём')}: {people.title(task.assignee_user_id)}"
    cta = dict(task.cta)
    if task.type == "sign" and not mine:
        cta["label"] = "Ознакомиться"
    return {
        "id": str(task.id),
        "type": task.type,
        "title": task.title,
        "application": {"id": str(app.id), "number": app.number} if app else None,
        "assignee": people.person(task.assignee_user_id),
        "waiting_for_text": waiting,
        "due_at": iso(task.due_at),
        "cta": cta,
        "available_actions": ["task.reassign"] if can_reassign else [],
        "created_at": iso(task.created_at),
    }


class TaskService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list(self, ctx: ClientContext, scope: str) -> list[dict]:
        filters = [Task.company_id == ctx.company.id, Task.status == "open"]
        if scope == "mine":
            filters.append(Task.assignee_user_id == ctx.user.id)
        elif scope == "waiting_others":
            filters.append(Task.assignee_user_id != ctx.user.id)
        tasks = list(await self.session.scalars(select(Task).where(*filters).order_by(Task.created_at.desc())))
        app_ids = {t.application_id for t in tasks if t.application_id}
        apps = (
            {a.id: a for a in await self.session.scalars(select(Application).where(Application.id.in_(app_ids)))}
            if app_ids
            else {}
        )
        people = await People.load(self.session, ctx.company)
        return [task_view(t, ctx, people, apps) for t in tasks]

    async def reassign(self, ctx: ClientContext, task_id: uuid.UUID, member_id: str) -> dict:
        from app.services.events import notify

        task = await self.session.get(Task, task_id)
        if task is None or task.company_id != ctx.company.id or task.status != "open":
            raise not_found("Задача не найдена")
        people = await People.load(self.session, ctx.company)
        if task.type not in REASSIGNABLE or not (task.assignee_user_id == ctx.user.id or ctx.has("manage_team")):
            raise validation("Эту задачу нельзя передать", {"task_id": "Задачу передаёт её исполнитель"})
        target = next((m for m in people.members.values() if str(m.id) == str(member_id)), None)
        if target is None or target.status.value != "active" or not target.user_id:
            raise validation("Сотрудник не найден", {"member_id": "Выберите активного сотрудника"})
        permission = TASK_PERMISSION[task.type]
        if permission not in (target.permissions or []):
            what = "загружать документы" if permission == "upload_documents" else "отправлять заявки"
            raise validation(f"У сотрудника нет права {what}", {"member_id": f"У сотрудника нет права {what}"})
        task.assignee_user_id = target.user_id
        if task.type == "send_application" and task.application_id:
            app = await self.session.get(Application, task.application_id)
            if app:
                app.handoff_to = target.user_id
        notify(
            self.session,
            [target.user_id],
            title="Вам передали задачу",
            text=task.title,
            application_id=task.application_id,
            route=task.cta.get("route"),
        )
        app_map = {}
        if task.application_id:
            app = await self.session.get(Application, task.application_id)
            if app:
                app_map[app.id] = app
        return task_view(task, ctx, people, app_map)

    async def request_document(
        self,
        ctx: ClientContext,
        *,
        member_id: str,
        document_type: str,
        application_id: str | None,
        comment: str | None,
    ) -> dict:
        from app.domain.catalog import DOCUMENT_TYPES_BY_CODE, document_title
        from app.services.events import add_task, notify

        if document_type not in DOCUMENT_TYPES_BY_CODE:
            raise validation("Неизвестный тип документа", {"document_type": "Выберите тип из списка"})
        people = await People.load(self.session, ctx.company)
        target = next((m for m in people.members.values() if str(m.id) == str(member_id)), None)
        if target is None or target.status.value != "active" or not target.user_id:
            raise validation("Сотрудник не найден", {"member_id": "Выберите активного сотрудника"})
        if "upload_documents" not in (target.permissions or []):
            raise validation("У сотрудника нет права загружать документы", {"member_id": "Нет права загрузки"})
        app = None
        if application_id:
            app = await self.session.get(Application, uuid.UUID(application_id))
            if app is None or app.company_id != ctx.company.id:
                raise not_found("Заявка не найдена")
        title = f"Загрузить: {document_title(document_type)}"
        if comment and comment.strip():
            title = f"{title}. {comment.strip()}"
        route = f"/documents?type={document_type}" + (f"&application_id={app.id}" if app else "")
        task = add_task(
            self.session,
            company_id=ctx.company.id,
            type_="upload_document",
            title=title,
            cta={"label": "Загрузить", "route": route},
            assignee=target.user_id,
            application_id=app.id if app else None,
            ref_id=document_type,
        )
        notify(
            self.session,
            [target.user_id],
            title=f"{people.title(ctx.user.id)} просит загрузить документ",
            text=title,
            application_id=app.id if app else None,
            route=route,
        )
        await self.session.flush()
        return task_view(task, ctx, people, {app.id: app} if app else {})
