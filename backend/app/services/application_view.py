import uuid
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain import state_machine as sm
from app.domain.catalog import PRODUCTS_BY_CODE, STATUS_TITLES
from app.domain.finance import monthly_payment
from app.models import (
    Application,
    ApplicationEvent,
    CallNote,
    Consent,
    Decision,
    InfoRequest,
    SigningRules,
    SigningSession,
    Task,
)
from app.services.common import ClientContext, People, iso, money, today
from app.services.company_data import CompanyData, document_valid, statements_document

STATUS_TEXT = {
    "draft": ("Заявка не отправлена", "Заполните данные и отправьте заявку в банк", "client"),
    "submitted": (
        "Проверяем данные компании и кредитную историю",
        "Заявка попадёт к аналитику или получит решение автоматически",
        "system",
    ),
    "in_review": ("Банк рассматривает заявку. От вас ничего не нужно", "Покажем решение здесь же", "bank"),
    "info_requested": (
        "Банку не хватает информации, ответьте на запрос",
        "После ответа продолжим рассмотрение",
        "client",
    ),
    "approved": ("Банк одобрил кредит", "Примите предложение и подпишите договор по правилам компании", "client"),
    "counter_offer": (
        "Банк готов выдать кредит на других условиях",
        "Примите предложение или откажитесь от него",
        "client",
    ),
    "rejected": ("Сейчас не можем выдать кредит", "Посмотрите, что повлияло и что можно улучшить", "bank"),
    "signing": ("Ждём подписи по правилам компании", "После всех подписей деньги поступят на счёт", "client"),
    "issued": ("Деньги на счёте", "Платите по графику", "system"),
    "cancelled": ("Заявка отозвана", "Можно подать новую заявку", "client"),
}

SIGN_DOC_TITLES = {
    "contract": "Кредитный договор",
    "surety": "Договор поручительства",
    "deal_approval": "Одобрение сделки",
}
SIGN_DOC_ACCUSATIVE = {
    "contract": "кредитный договор",
    "surety": "договор поручительства",
    "deal_approval": "одобрение сделки",
}


@dataclass
class AppExtras:
    tasks: list[Task] = field(default_factory=list)
    signing: SigningSession | None = None
    rules: dict | None = None
    open_info_requests: list[InfoRequest] = field(default_factory=list)
    offer_valid_until: str | None = None


async def load_extras(session: AsyncSession, apps: list[Application]) -> dict[uuid.UUID, AppExtras]:
    ids = [a.id for a in apps]
    extras = {a.id: AppExtras() for a in apps}
    if not ids:
        return extras
    for task in await session.scalars(select(Task).where(Task.application_id.in_(ids), Task.status == "open")):
        extras[task.application_id].tasks.append(task)
    for s in await session.scalars(select(SigningSession).where(SigningSession.application_id.in_(ids))):
        extras[s.application_id].signing = s
    for r in await session.scalars(
        select(InfoRequest)
        .where(InfoRequest.application_id.in_(ids), InfoRequest.status == "open")
        .order_by(InfoRequest.created_at)
    ):
        extras[r.application_id].open_info_requests.append(r)
    company_ids = {a.company_id for a in apps}
    rules = {
        r.company_id: r.rules
        for r in await session.scalars(select(SigningRules).where(SigningRules.company_id.in_(company_ids)))
    }
    for d in await session.scalars(
        select(Decision).where(Decision.application_id.in_(ids)).order_by(Decision.created_at)
    ):
        extras[d.application_id].offer_valid_until = d.payload.get("offer_valid_until")
    for a in apps:
        extras[a.id].rules = rules.get(a.company_id)
    return extras


def pending_signers(signing: SigningSession | None) -> list[dict]:
    return [s for s in (signing.signers if signing else []) if s["status"] == "pending"]


def available_actions(app: Application, ctx: ClientContext | None, extras: AppExtras) -> list[str]:
    if ctx is None:
        return []
    actions: list[str] = []
    status = app.status.value
    submit = ctx.has("submit_applications")
    upload = ctx.has("upload_documents")
    user_id = str(ctx.user.id)

    if status == sm.DRAFT:
        if submit or app.handoff_to == ctx.user.id:
            actions.append("application.edit")
        if submit or ctx.has("sign"):
            actions.append("consent.sign")
        if submit:
            actions.append("application.submit")
        elif upload:
            actions.append("application.handoff")
    if status in sm.CANCELLABLE and submit:
        actions.append("application.cancel")
    if upload:
        actions.append("document.upload")
        if ctx.member.role.value != "authorized_employee":
            actions.append("document.delete")
    if status == sm.INFO_REQUESTED and upload:
        actions.append("info_request.respond")
    can_send = ctx.member.role.value in (extras.rules or {}).get("can_send_to_signing", [])
    if status in (sm.APPROVED, sm.COUNTER_OFFER):
        if ctx.has("accept_offers"):
            actions.append("offer.accept")
            if status == sm.COUNTER_OFFER:
                actions.append("offer.decline")
        if can_send:
            actions.append("signing.send")
    if status == sm.SIGNING:
        if any(s["user_id"] == user_id for s in pending_signers(extras.signing)):
            actions.append("signing.sign")
        if can_send:
            actions.append("signing.remind")
    return actions


def required_action(app: Application, extras: AppExtras) -> str | None:
    status = app.status.value
    if status == sm.DRAFT:
        return "Проверить и отправить заявку в банк" if app.handoff_to else "Заполните заявку и отправьте в банк"
    if status == sm.INFO_REQUESTED:
        return extras.open_info_requests[0].question if extras.open_info_requests else "Ответьте на запрос банка"
    if status == sm.APPROVED:
        return "Примите предложение, чтобы перейти к подписанию"
    if status == sm.COUNTER_OFFER:
        return "Посмотрите предложение банка и примите решение"
    if status == sm.SIGNING:
        return "Подпишите документы по правилам компании"
    return None


def awaiting_from(app: Application, extras: AppExtras, people: People) -> dict | None:
    status = app.status.value
    if status == sm.SIGNING:
        pending = pending_signers(extras.signing)
        return people.person(uuid.UUID(pending[0]["user_id"])) if pending else None
    task_type = {
        sm.INFO_REQUESTED: "info_request",
        sm.APPROVED: "accept_offer",
        sm.COUNTER_OFFER: "accept_offer",
        sm.DRAFT: "send_application",
    }.get(status)
    if task_type:
        task = next((t for t in extras.tasks if t.type == task_type), None)
        if task and task.assignee_user_id:
            return people.person(task.assignee_user_id)
    return None


def product_ref(code: str) -> dict:
    p = PRODUCTS_BY_CODE.get(code)
    return {"code": code, "name": p["name"] if p else code}


def summary(app: Application, ctx: ClientContext | None, extras: AppExtras, people: People) -> dict:
    decided = app.status.value in sm.DECIDED
    return {
        "id": str(app.id),
        "number": app.number,
        "product": product_ref(app.product_code),
        "purpose": app.purpose,
        "requested_amount": money(app.requested_amount),
        "requested_term_months": app.requested_term_months,
        "approved_amount": money(app.approved_amount) if decided else None,
        "approved_term_months": app.approved_term_months if decided else None,
        "status": app.status.value,
        "required_action": required_action(app, extras),
        "awaiting_from": awaiting_from(app, extras, people),
        "available_actions": available_actions(app, ctx, extras),
        "created_at": iso(app.created_at),
        "updated_at": iso(app.updated_at),
    }


def call_note_view(c: CallNote) -> dict:
    return {
        "id": str(c.id),
        "stage": c.stage,
        "stage_title": STATUS_TITLES.get(c.stage, c.stage).capitalize(),
        "called_at": iso(c.called_at),
        "duration_minutes": c.duration_minutes,
        "topic": c.topic,
        "summary": c.summary,
        "agreements": list(c.agreements or []),
        "next_step": c.next_step,
        "next_step_due": c.next_step_due.isoformat() if c.next_step_due else None,
        "author_name": c.author_name,
    }


def info_request_view(r: InfoRequest) -> dict:
    return {
        "id": str(r.id),
        "created_at": iso(r.created_at),
        "due_at": iso(r.due_at),
        "question": r.question,
        "purpose_text": r.purpose_text,
        "requested_document_types": list(r.document_types or []),
        "lk_available": r.lk_available,
        "status": r.status,
        "response": r.response,
    }


def signing_state(
    app: Application, signing: SigningSession | None, people: People, user_id: uuid.UUID | None
) -> dict | None:
    if signing is None:
        return None
    me = str(user_id) if user_id else None
    mine = next((s for s in signing.signers if s["user_id"] == me and s["status"] == "pending"), None)
    doc_types = list(dict.fromkeys(s["document"] for s in signing.signers))
    required = [s for s in signing.signers if s.get("required", True)]
    return {
        "documents": [
            {
                "id": f"sign-{app.id}-{t}",
                "title": SIGN_DOC_TITLES[t],
                "type": t,
                "url": f"/api/v1/documents/sign-{app.id}-{t}/file",
            }
            for t in doc_types
        ],
        "signers": [
            {
                "order": s["order"],
                "person": people.person(uuid.UUID(s["user_id"])),
                "document": s["document"],
                "status": s["status"],
                "signed_at": s.get("signed_at"),
            }
            for s in signing.signers
        ],
        "signed_count": sum(1 for s in required if s["status"] == "signed"),
        "required_count": len(required),
        "can_current_user_sign": app.status.value == sm.SIGNING and mine is not None,
        "current_user_document": mine["document"] if mine else None,
    }


async def detail(
    session: AsyncSession, app: Application, ctx: ClientContext | None, people: People, user_id: uuid.UUID | None
) -> dict:
    extras = (await load_extras(session, [app]))[app.id]
    events = list(
        await session.scalars(
            select(ApplicationEvent).where(ApplicationEvent.application_id == app.id).order_by(ApplicationEvent.at)
        )
    )
    info_requests = list(
        await session.scalars(
            select(InfoRequest).where(InfoRequest.application_id == app.id).order_by(InfoRequest.created_at)
        )
    )
    calls = list(
        await session.scalars(
            select(CallNote).where(CallNote.application_id == app.id).order_by(CallNote.called_at.desc())
        )
    )
    decision = await session.scalar(
        select(Decision).where(Decision.application_id == app.id).order_by(Decision.created_at.desc()).limit(1)
    )
    amount = app.approved_amount if app.status.value in sm.DECIDED and app.approved_amount else app.requested_amount
    term = (
        app.approved_term_months
        if app.status.value in sm.DECIDED and app.approved_term_months
        else app.requested_term_months
    )
    now_text, next_text, actor = STATUS_TEXT[app.status.value]
    due_at = None
    if app.status.value == sm.INFO_REQUESTED and extras.open_info_requests:
        due_at = iso(extras.open_info_requests[0].due_at)
    elif app.status.value in (sm.APPROVED, sm.COUNTER_OFFER):
        due_at = extras.offer_valid_until
    return {
        **summary(app, ctx, extras, people),
        "purpose_code": app.purpose_code,
        "rate_percent": float(app.rate_percent),
        "monthly_payment_estimate": money(monthly_payment(app.product_code, amount, term, float(app.rate_percent))),
        "load_at_submit": app.load_at_submit,
        "client_warning_accepted": app.client_warning_accepted,
        "collateral": app.collateral,
        "form": {
            "step": app.form_step,
            "data": app.form_data or {},
            "saved_at": iso(app.form_saved_at or app.created_at),
        },
        "timeline": [
            {
                "at": iso(e.at),
                "status": e.to_status,
                "title": e.title,
                "description": e.description,
                "actor": {"type": e.actor_type, "name": e.actor_name},
            }
            for e in events
        ],
        "status_text": {"now": now_text, "next": next_text, "actor": actor, "due_at": due_at},
        "info_requests": [info_request_view(r) for r in info_requests],
        "calls": [call_note_view(c) for c in calls],
        "decision": decision.payload if decision else None,
        "signing": signing_state(app, extras.signing, people, user_id),
        "version": app.version,
    }


async def requirements(session: AsyncSession, app: Application, data: CompanyData) -> dict:
    legal_form = data.company.legal_form.value
    day = today()
    consents = {c.type for c in await session.scalars(select(Consent).where(Consent.application_id == app.id))}
    docs = await data.documents()

    def valid(doc_type: str, application_id: uuid.UUID | None = None) -> bool:
        return any(
            d.document_type == doc_type
            and document_valid(d, day)
            and (application_id is None or d.application_id == application_id)
            for d in docs
        )

    items = [
        {
            "code": "consent_bki",
            "title": "Согласие на запрос в бюро кредитных историй",
            "necessity": "required",
            "status": "done" if "consent_bki" in consents else "missing",
            "source": "client" if "consent_bki" in consents else None,
            "note": "Подписывается кодом в кабинете уполномоченным лицом",
            "action": {"type": "sign", "document_type": None},
        },
        {
            "code": "consent_pd",
            "title": "Согласие на обработку персональных данных",
            "necessity": "required",
            "status": "done",
            "source": "alfa_lk",
            "note": "Уже есть в Альфа-Бизнесе",
            "action": None,
        },
    ]

    if legal_form == "OOO":
        missing = [t for t in ("charter", "director_decision") if not valid(t)]
        items.append(
            {
                "code": "company_docs",
                "title": "Устав и решение о назначении директора",
                "necessity": "required",
                "status": "missing" if missing else "done",
                "source": "documents",
                "note": "Берём из документов компании" if not missing else "Выберите или загрузите документ компании",
                "action": {"type": "pick_document", "document_type": missing[0]} if missing else None,
            }
        )
    else:
        items.append(
            {
                "code": "company_docs",
                "title": "Паспорт предпринимателя",
                "necessity": "required",
                "status": "done",
                "source": "alfa_lk",
                "note": "Берём из Альфа-Бизнеса",
                "action": None,
            }
        )

    statements = statements_document(legal_form)
    if not await data.statements_needed():
        fin_status, fin_note = "not_needed", "Не нужна: налоги видны в Альфа-Бухгалтерии"
    elif valid(statements):
        fin_status, fin_note = "done", None
    else:
        fin_status, fin_note = "missing", "Банк запросит, если понадобится. С ней сумма может быть больше"
    items.append(
        {
            "code": "fin_statements_2025",
            "title": "Бухгалтерская отчётность за 2025 год"
            if legal_form == "OOO"
            else "Налоговая декларация за 2025 год",
            "necessity": "situational",
            "status": fin_status,
            "source": "documents",
            "note": fin_note,
            "action": {"type": "upload", "document_type": statements} if fin_status == "missing" else None,
        }
    )

    multibank = False
    try:
        multibank = bool((await data.external.multibank(data.inn)).get("connected"))
    except Exception:  # noqa: BLE001 - мок недоступен, считаем Мультибанк неподключённым
        multibank = False
    other_bank_known = any(d.document_type == "other_bank_statements" for d in docs)
    if multibank or not other_bank_known:
        ob_status = "not_needed"
        ob_note = (
            "Счета в других банках видны через Мультибанк" if multibank else "Нужна, если есть счета в других банках"
        )
    else:
        ob_status = "done" if valid("other_bank_statements") else "missing"
        ob_note = None if ob_status == "done" else "Прошлая выписка устарела, загрузите выписку за последние 6 месяцев"
    items.append(
        {
            "code": "other_bank_statements",
            "title": "Выписка по счёту в другом банке",
            "necessity": "situational",
            "status": ob_status,
            "source": "documents",
            "note": ob_note,
            "action": {"type": "upload", "document_type": "other_bank_statements"} if ob_status == "missing" else None,
        }
    )

    with_collateral = bool(app.collateral and app.collateral.get("type") not in (None, "none"))
    if with_collateral:
        c_status = "done" if valid("collateral_docs", app.id) else "missing"
    else:
        c_status = "not_needed"
    items.append(
        {
            "code": "collateral_docs",
            "title": "Документы по залогу",
            "necessity": "required" if with_collateral else "situational",
            "status": c_status,
            "source": "documents",
            "note": None if with_collateral else "Нужны, только если выбран залог",
            "action": {"type": "upload", "document_type": "collateral_docs"} if c_status == "missing" else None,
        }
    )
    return {"items": items, "can_submit": all(i["status"] == "done" for i in items if i["necessity"] == "required")}


def requested_payment(app: Application) -> int:
    return monthly_payment(app.product_code, app.requested_amount, app.requested_term_months, float(app.rate_percent))
