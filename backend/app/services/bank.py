"""Банковский кабинет (К.14): очередь, карточка аналитика, решение, показатели и настройки скоринга."""

import uuid
from datetime import timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import invalid_transition, not_found, validation
from app.domain import matching as matching_domain
from app.domain import scoring, texts
from app.domain import state_machine as sm
from app.domain.catalog import DOCUMENT_TYPES_BY_CODE, PRODUCTS_BY_CODE
from app.domain.facts import low_months
from app.domain.finance import Thresholds
from app.integrations.external import ExternalSystems
from app.models import (
    Application,
    ApplicationEvent,
    ApplicationStatus,
    AuditLog,
    Company,
    Decision,
    Document,
    InfoRequest,
    Setting,
    User,
)
from app.services import ai
from app.services.application_view import detail, load_extras, summary
from app.services.common import THRESHOLDS_KEY, People, iso, now, parse_dt, thresholds
from app.services.company_data import CompanyData
from app.services.documents import DocumentService
from app.services.events import Actor, audit, transition
from app.services.review import (
    apply_decision,
    check_view,
    create_info_request,
    decision_payload,
    latest_checks,
    latest_scoring,
    run_checks,
)


def bank_actor(user: User) -> Actor:
    return Actor("bank", user.id, user.short_name)


def bank_person(user: User | None) -> dict | None:
    if user is None:
        return None
    # у сотрудника банка нет роли в компании; роль заполняем нейтральной
    return {"user_id": str(user.id), "name": user.short_name, "role": "authorized_employee"}


def bank_actions(app: Application, user: User) -> list[str]:
    actions = []
    underwriter = user.bank_role is not None and user.bank_role.value == "underwriter"
    if underwriter and app.status.value in sm.IN_BANK and app.bank_assignee_id != user.id:
        actions.append("bank.take")
    if underwriter and app.status.value == sm.IN_REVIEW:
        actions += ["bank.decide", "bank.request_info"]
    return actions


def checks_hint(checks: list[dict]) -> tuple[str, str | None]:
    status = scoring.checks_status(checks) if checks else "ok"
    if status == "stop":
        stop = next(c for c in checks if c["status"] == "stop")
        return status, f"стоп-фактор: {stop['summary'].lower()}"
    if status == "warning":
        warn = next(c for c in checks if c["status"] in ("warning", "error"))
        return status, f"внимание: {warn['summary'].lower()}"
    return status, None


class BankService:
    def __init__(self, session: AsyncSession, external: ExternalSystems) -> None:
        self.session = session
        self.external = external

    async def get_app(self, app_id: uuid.UUID, *, lock: bool = False) -> Application:
        app = await self.session.get(Application, app_id, with_for_update=lock)
        if app is None or app.status.value == sm.DRAFT:
            raise not_found("Заявка не найдена")
        return app

    async def ensure_scoring(self, app: Application) -> None:
        """У заявок без автопроверок (например, из seed) проверки считаются при первом открытии."""
        if await latest_scoring(self.session, app.id) is None:
            company = await self.session.get(Company, app.company_id)
            await run_checks(self.session, app, CompanyData(self.session, self.external, company))
            await self.session.flush()

    async def queue(
        self,
        user: User,
        *,
        statuses: list[str],
        risk: str | None,
        checks: str | None,
        mine: bool,
        sort: str,
        page: int,
        page_size: int,
    ) -> dict:
        filters = (
            [Application.status.in_(statuses)]
            if statuses
            else [Application.status.in_(sm.IN_BANK) | Application.auto_decided.is_(True)]
        )
        apps = list(await self.session.scalars(select(Application).where(*filters)))
        t = await thresholds(self.session)
        extras = await load_extras(self.session, apps)
        companies = (
            {
                c.id: c
                for c in await self.session.scalars(select(Company).where(Company.id.in_({a.company_id for a in apps})))
            }
            if apps
            else {}
        )
        assignees = (
            {
                u.id: u
                for u in await self.session.scalars(
                    select(User).where(User.id.in_({a.bank_assignee_id for a in apps if a.bank_assignee_id}))
                )
            }
            if any(a.bank_assignee_id for a in apps)
            else {}
        )
        people_cache: dict[uuid.UUID, People] = {}

        items = []
        for app in apps:
            if app.status.value in sm.IN_BANK and app.status.value != sm.SUBMITTED:
                await self.ensure_scoring(app)
            result = await latest_scoring(self.session, app.id)
            check_items = [check_view(c) for c in await latest_checks(self.session, app.id)]
            status, hint = checks_hint(check_items)
            company = companies[app.company_id]
            if company.id not in people_cache:
                people_cache[company.id] = await People.load(self.session, company)
            queued = app.queued_at or app.updated_at
            item = {
                **summary(app, None, extras[app.id], people_cache[company.id]),
                "available_actions": bank_actions(app, user),
                "company": {
                    "id": str(company.id),
                    "short_name": company.short_name,
                    "legal_form": company.legal_form.value,
                    "inn": company.inn,
                },
                "score": result.total if result else None,
                "risk_level": scoring.risk_level(result.total if result else None, t),
                "checks_status": status,
                "checks_hint": hint,
                "auto_decided": app.auto_decided,
                "in_queue_minutes": max(0, int((now() - queued).total_seconds() // 60)),
                "assignee": bank_person(assignees.get(app.bank_assignee_id)),
            }
            items.append(item)

        if mine:
            items = [i for i in items if i["assignee"] and i["assignee"]["user_id"] == str(user.id)]
        if risk == "high":
            items = [i for i in items if i["risk_level"] == "high" or i["checks_status"] == "warning"]
        if checks == "stop":
            items = [i for i in items if i["checks_status"] == "stop"]
        if sort == "risk":
            items.sort(key=lambda i: (i["auto_decided"], i["score"] if i["score"] is not None else 101))
        else:
            items.sort(key=lambda i: (i["auto_decided"], -i["in_queue_minutes"]))
        start = (page - 1) * page_size
        return {"items": items[start : start + page_size], "page": page, "page_size": page_size, "total": len(items)}

    async def detail(self, user: User, app: Application) -> dict:
        if app.status.value != sm.SUBMITTED:
            await self.ensure_scoring(app)
        company = await self.session.get(Company, app.company_id)
        people = await People.load(self.session, company)
        data = CompanyData(self.session, self.external, company)
        base = await detail(self.session, app, None, people, None)
        base["available_actions"] = bank_actions(app, user)
        try:
            finance = await data.finance_summary()
        except Exception:  # noqa: BLE001 - Альфа-Бизнес недоступен: карточка открывается без финансов
            finance = empty_finance()
        result = await latest_scoring(self.session, app.id)
        docs = list(
            await self.session.scalars(
                select(Document)
                .where(
                    Document.company_id == company.id,
                    (Document.application_id.is_(None)) | (Document.application_id == app.id),
                )
                .order_by(Document.uploaded_at.desc())
            )
        )
        audit_rows = await self.session.scalars(
            select(AuditLog)
            .where(AuditLog.entity == "application", AuditLog.entity_id == str(app.id))
            .order_by(AuditLog.at)
        )
        t = await thresholds(self.session)
        return {
            **base,
            "company": await data.company_profile([]),
            "finance": finance,
            "checks": [check_view(c) for c in await latest_checks(self.session, app.id)],
            "scoring": result.payload
            if result
            else {
                "total": 0,
                "factors": [],
                "thresholds": t.as_dict(),
                "outcome": "manual_review",
                "stop_factors": [],
            },
            "documents": await DocumentService(self.session, self.external).views(company, docs),
            "ai_summary": app.ai_summary,
            "audit": [
                {"at": iso(a.at), "actor": a.actor, "action": a.action, "details": a.details} for a in audit_rows
            ],
        }

    async def take(self, user: User, app: Application) -> None:
        if app.status.value not in sm.IN_BANK:
            raise invalid_transition("Заявка уже не в очереди")
        app.bank_assignee_id = user.id
        if app.status == ApplicationStatus.SUBMITTED:
            await self.ensure_scoring(app)
            transition(self.session, app, ApplicationStatus.IN_REVIEW, bank_actor(user), title="Заявку взял аналитик")
            app.queued_at = now()
        audit(self.session, actor=bank_actor(user), action="Взял в работу", entity="application", entity_id=app.id)

    async def ai_summary(self, user: User, app: Application) -> None:
        """И7: резюме из фактов от модели или из шаблона; решение принимает аналитик."""
        await self.ensure_scoring(app)
        company = await self.session.get(Company, app.company_id)
        result = await latest_scoring(self.session, app.id)
        check_items = [check_view(c) for c in await latest_checks(self.session, app.id)]
        load = (result.load or {}).get("load_percent") if result else None
        t = await thresholds(self.session)
        data = CompanyData(self.session, self.external, company)
        facts, _ = await data.facts()
        risks, to_check = [], []
        for c in check_items:
            if c["status"] in ("warning", "stop"):
                risks.append(c["summary"])
            if c["status"] == "error":
                to_check.append(f"Проверить вручную: {c['summary'].lower()}")
        if app.client_warning_accepted:
            risks.append("Клиент оставил сумму вопреки предупреждению о нагрузке")
        required, situational = await data.document_gaps()
        if situational or required:
            risks.append("Нет отчётности за 2025 год" if situational else "Не хватает обязательных документов")
            to_check.append("Запросить недостающие документы")
        to_check.append("Сверить обороты по выписке с данными заявки")
        docs = list(await self.session.scalars(select(Document).where(Document.company_id == company.id)))
        if any(d.status == "rejected" for d in docs):
            to_check.append("Посмотреть отклонённые документы")
        template = {
            "text": texts.analyst_summary(
                company_name=company.short_name,
                registration_year=company.registration_date.year,
                amount=app.requested_amount,
                term=app.requested_term_months,
                purpose=app.purpose,
                score=result.total if result else None,
                load=load,
                threshold=t.load_threshold_percent,
                seasonality_months=low_months(facts.months),
                warning_accepted=app.client_warning_accepted,
            ),
            "risks": risks[:4],
            "to_check": to_check[:4],
            "text_source": texts.TEMPLATE,
            "generated_at": iso(now()),
        }
        lows = low_months(facts.months)
        # в модель только факты для решения: без ФИО, паспортов и счетов (8.1 п.6)
        facts_for_llm = {
            "product": PRODUCTS_BY_CODE[app.product_code]["name"],
            "requested": {"amount_rub": ai.rubles(app.requested_amount), "term_months": app.requested_term_months},
            "finance": {
                "inflow_avg_rub": ai.rubles(facts.monthly_inflow_avg or 0),
                "free_cash_flow_rub": ai.rubles(facts.free_cash_flow or 0),
                "seasonality": texts.seasonality_text(lows) if lows else None,
            },
            "load": {"percent": load or 0, "threshold": t.load_threshold_percent},
            "score": result.total if result else 0,
            "outcome": result.payload["outcome"] if result else "manual_review",
            "checks": [{"source": c["source"], "status": c["status"], "summary": c["summary"]} for c in check_items],
            "documents": [
                {
                    "title": d.title,
                    "issues": [i["text"] for i in (d.analysis or {}).get("issues", []) if i["severity"] != "info"]
                    + ([d.status_reason] if d.status == "rejected" and d.status_reason else []),
                }
                for d in docs
                if d.status == "rejected" or any(i["severity"] != "info" for i in (d.analysis or {}).get("issues", []))
            ],
            "client_warning_accepted": app.client_warning_accepted,
            # название компании убираем: у ИП это ФИО
            "facts_text": template["text"].replace(company.short_name, "Компания"),
        }
        app.ai_summary = await ai.analyst_summary(facts_for_llm, template)
        audit(self.session, actor=bank_actor(user), action="Обновил ИИ-резюме", entity="application", entity_id=app.id)

    async def rerun_checks(self, user: User, app: Application) -> None:
        company = await self.session.get(Company, app.company_id)
        result, _, _ = await run_checks(self.session, app, CompanyData(self.session, self.external, company))
        audit(
            self.session,
            actor=bank_actor(user),
            action="Повторил автопроверки",
            entity="application",
            entity_id=app.id,
            details=f"Балл {result['total']}",
        )

    async def counter_offer_options(self, app: Application) -> dict:
        company = await self.session.get(Company, app.company_id)
        facts, _ = await CompanyData(self.session, self.external, company).facts()
        if not facts.finance_available:
            return {"options": []}
        t = await thresholds(self.session)
        options = matching_domain.counter_offer_options(
            app.product_code,
            app.purpose_code,
            app.requested_amount,
            app.requested_term_months,
            facts,
            t,
            lambda load: scoring.score(facts, load, t)["total"],
        )
        return {"options": options}

    def validate_decision(self, body: dict) -> None:
        errors = {}
        kind = body.get("type")
        if kind == "counter_offer":
            if not (body.get("amount") or {}).get("value"):
                errors["amount"] = "Укажите сумму"
            if not body.get("term_months"):
                errors["term_months"] = "Укажите срок"
            if body.get("rate_percent") is None:
                errors["rate_percent"] = "Укажите ставку"
            if not body.get("reason_code"):
                errors["reason_code"] = "Выберите причину"
            if body.get("product_code") and body["product_code"] not in PRODUCTS_BY_CODE:
                errors["product_code"] = "Неизвестный продукт"
        elif kind == "request_info":
            if not (body.get("question") or "").strip():
                errors["question"] = "Напишите вопрос"
            if not body.get("requested_document_types"):
                errors["requested_document_types"] = "Выберите документы"
            if not body.get("due_at"):
                errors["due_at"] = "Укажите срок"
        elif kind == "reject":
            if not body.get("reason_codes"):
                errors["reason_codes"] = "Выберите причину"
        elif kind != "approve":
            errors["type"] = "approve, counter_offer, request_info или reject"
        if errors:
            raise validation("Проверьте поля", errors)

    async def build_decision(self, app: Application, body: dict) -> dict:
        """Decision по телу решения аналитика; тексты для клиента от модели (И5, И8) или из шаблонов."""
        return await ai.decision_texts(await self.decision_template(app, body))

    async def decision_template(self, app: Application, body: dict) -> dict:
        result = await latest_scoring(self.session, app.id)
        t = await thresholds(self.session)
        scoring_payload = result.payload if result else None
        requested_load = result.load if result else None
        kind = body["type"]
        if kind == "approve":
            return decision_payload(app, "approved", "underwriter", scoring_payload, requested_load, t)
        if kind == "reject":
            return decision_payload(
                app,
                "rejected",
                "underwriter",
                scoring_payload,
                requested_load,
                t,
                reason_codes=body.get("reason_codes"),
            )
        offer = {
            "product_code": body.get("product_code") or app.product_code,
            "amount": body["amount"]["value"],
            "term_months": body["term_months"],
            "rate_percent": float(body["rate_percent"]),
        }
        return decision_payload(app, "counter_offer", "underwriter", scoring_payload, requested_load, t, offer=offer)

    async def preview(self, app: Application, body: dict) -> dict:
        self.validate_decision(body)
        if body["type"] == "request_info":
            types = body["requested_document_types"]
            return {
                "client_view": {
                    "id": str(uuid.uuid4()),
                    "created_at": iso(now()),
                    "due_at": iso(parse_dt(body["due_at"])),
                    "question": body["question"].strip(),
                    "purpose_text": body.get("purpose_text"),
                    "requested_document_types": types,
                    "lk_available": any(DOCUMENT_TYPES_BY_CODE.get(x, {}).get("can_generate_from_lk") for x in types),
                    "status": "open",
                    "response": None,
                }
            }
        return {"client_view": await self.build_decision(app, body)}

    async def decide(self, user: User, app: Application, body: dict) -> None:
        self.validate_decision(body)
        if app.status != ApplicationStatus.IN_REVIEW:
            raise invalid_transition("Решение принимают по заявке на рассмотрении")
        app.bank_assignee_id = app.bank_assignee_id or user.id
        actor = bank_actor(user)
        if body["type"] == "request_info":
            await create_info_request(
                self.session,
                app,
                question=body["question"].strip(),
                document_types=body["requested_document_types"],
                due_at=parse_dt(body["due_at"]),
                purpose_text=body.get("purpose_text"),
                actor=actor,
                created_by=user.id,
            )
        else:
            payload = await self.build_decision(app, body)
            await apply_decision(self.session, app, payload, actor, decided_by_user_id=user.id)
        audit(
            self.session,
            actor=actor,
            action=f"Решение: {body['type']}",
            entity="application",
            entity_id=app.id,
            details=body.get("comment") or body.get("reason_code") or None,
        )

    async def dashboard(self, period: str) -> dict:
        days = 30 if period == "30d" else 7
        since = now() - timedelta(days=days)
        counts = dict(
            (
                await self.session.execute(
                    select(Application.status, func.count())
                    .where(Application.updated_at >= since)
                    .group_by(Application.status)
                )
            ).all()
        )
        decisions = list(await self.session.scalars(select(Decision).where(Decision.created_at >= since)))
        minutes = []
        for d in decisions:
            submitted_at = await self.session.scalar(
                select(func.max(ApplicationEvent.at)).where(
                    ApplicationEvent.application_id == d.application_id,
                    ApplicationEvent.to_status == "submitted",
                    ApplicationEvent.at <= d.created_at,
                )
            )
            if submitted_at:
                minutes.append((d.created_at - submitted_at).total_seconds() / 60)
        submitted_apps = (
            await self.session.scalar(
                select(func.count(func.distinct(ApplicationEvent.application_id))).where(
                    ApplicationEvent.to_status == "submitted", ApplicationEvent.at >= since
                )
            )
            or 0
        )
        with_requests = (
            await self.session.scalar(
                select(func.count(func.distinct(InfoRequest.application_id))).where(InfoRequest.created_at >= since)
            )
            or 0
        )
        return {
            "period": f"{days}d",
            "by_status": {s.value: counts.get(s, 0) for s in ApplicationStatus},
            "avg_decision_minutes": round(sum(minutes) / len(minutes)) if minutes else 0,
            "auto_decision_share": round(sum(1 for d in decisions if d.decided_by == "auto") / len(decisions), 2)
            if decisions
            else 0.0,
            "info_request_share": round(with_requests / submitted_apps, 2) if submitted_apps else 0.0,
        }

    async def scoring_settings(self) -> dict:
        return (await thresholds(self.session)).as_dict()

    async def put_scoring_settings(self, user: User, body: dict) -> dict:
        try:
            t = Thresholds(
                approve_min=int(body["approve_min"]),
                counter_offer_min=int(body["counter_offer_min"]),
                manual_review_min=int(body["manual_review_min"]),
                load_threshold_percent=float(body["load_threshold_percent"]),
                load_target_percent=float(body["load_target_percent"]),
            )
        except (KeyError, TypeError, ValueError) as e:
            raise validation("Проверьте поля", {"body": "Нужны все пороги числами"}) from e
        errors = {}
        if not 0 <= t.manual_review_min <= t.counter_offer_min <= t.approve_min <= 100:
            errors["approve_min"] = "Пороги по возрастанию: ручная проверка ≤ другие условия ≤ одобрение ≤ 100"
        if not 0 < t.load_target_percent <= t.load_threshold_percent <= 100:
            errors["load_target_percent"] = "Целевая нагрузка не выше порога"
        if errors:
            raise validation("Проверьте поля", errors)
        row = await self.session.get(Setting, THRESHOLDS_KEY)
        if row is None:
            row = Setting(key=THRESHOLDS_KEY, value=t.as_dict(), updated_at=now())
            self.session.add(row)
        else:
            row.value = t.as_dict()
            row.updated_at = now()
        audit(
            self.session,
            actor=bank_actor(user),
            action="Изменены пороги скоринга",
            entity="settings",
            entity_id=THRESHOLDS_KEY,
            details=", ".join(f"{k}={v}" for k, v in t.as_dict().items()),
        )
        return t.as_dict()


def empty_finance() -> dict:
    zero = {"value": 0, "currency": "RUB"}
    return {
        "period": {"from": "", "to": ""},
        "monthly_inflow_avg": {"value": zero, "source": "system", "as_of": None, "editable": False},
        "monthly_operating_outflow_avg": {"value": zero, "source": "system", "as_of": None, "editable": False},
        "free_cash_flow": {"value": zero, "source": "system", "as_of": None, "editable": False},
        "months": [],
        "seasonality": None,
        "debts": {"items": [], "total_monthly_payment": zero},
        "multibank_connected": False,
        "stale": {"reason": None, "text": "Данные Альфа-Бизнеса недоступны"},
        "confirmed_at": None,
    }
