"""Рассмотрение заявки: автопроверки, скоринг, авторешение (3.5), решения и запросы банка."""

import logging
import uuid
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.domain import scoring, texts
from app.domain import state_machine as sm
from app.domain.catalog import DOCUMENT_TYPES_BY_CODE, REJECTION_REASON_TITLES
from app.domain.facts import CompanyFacts
from app.domain.finance import Thresholds, load_calc, load_percent, monthly_payment, overpayment
from app.integrations.external import ExternalSystems
from app.models import (
    Application,
    ApplicationStatus,
    CheckResult,
    Company,
    Decision,
    InfoRequest,
    ScoringResult,
)
from app.services import ai
from app.services.application_view import product_ref, requested_payment, requirements
from app.services.common import People, iso, money, now, thresholds, today
from app.services.company_data import CompanyData
from app.services.events import SYSTEM, Actor, add_task, audit, transition

log = logging.getLogger(__name__)

OFFER_VALID_DAYS = 14


def application_load(
    app: Application,
    facts: CompanyFacts,
    t: Thresholds,
    amount: int | None = None,
    term: int | None = None,
    rate: float | None = None,
    product_code: str | None = None,
) -> dict | None:
    if not facts.finance_available:
        return None
    payment = monthly_payment(
        product_code or app.product_code,
        amount or app.requested_amount,
        term or app.requested_term_months,
        rate if rate is not None else float(app.rate_percent),
    )
    return load_calc(facts.free_cash_flow or 0, facts.current_payments or 0, payment, t)


def score_for(facts: CompanyFacts, load: dict | None, t: Thresholds) -> dict:
    return scoring.score(facts, load["load_percent"] if load else 0.0, t)


async def latest_scoring(session: AsyncSession, app_id: uuid.UUID) -> ScoringResult | None:
    return await session.scalar(
        select(ScoringResult)
        .where(ScoringResult.application_id == app_id)
        .order_by(ScoringResult.created_at.desc())
        .limit(1)
    )


async def latest_checks(session: AsyncSession, app_id: uuid.UUID) -> list[CheckResult]:
    return list(
        await session.scalars(
            select(CheckResult).where(CheckResult.application_id == app_id).order_by(CheckResult.source)
        )
    )


def check_view(c: CheckResult) -> dict:
    return {
        "source": c.source,
        "status": c.status,
        "summary": c.summary,
        "details": c.details,
        "checked_at": iso(c.checked_at),
        "is_mock": True,
    }


async def run_checks(
    session: AsyncSession, app: Application, data: CompanyData
) -> tuple[dict, list[dict], dict | None]:
    """Автопроверки и скоринг по запрошенным условиям; результаты заменяют прежние."""
    t = await thresholds(session)
    facts, avail = await data.facts()
    load = application_load(app, facts, t)
    load_value = load["load_percent"] if load else 0.0
    result = scoring.score(facts, load_value, t)
    checks = scoring.checks(
        facts,
        load_value,
        t,
        registry_ok=avail["registry_ok"],
        bki_ok=avail["bki_ok"],
        finance_ok=avail["finance_ok"],
        fns_ok=avail["fns_ok"],
        checked_at=iso(now()),
    )
    raw_by_source = {
        "registry": avail["raw"]["registry"],
        "credit_bureau": avail["raw"]["bki"],
        "fns_transparent": avail["raw"]["fns"],
    }
    await session.execute(delete(CheckResult).where(CheckResult.application_id == app.id))
    for c in checks:
        session.add(
            CheckResult(
                application_id=app.id,
                source=c["source"],
                status=c["status"],
                summary=c["summary"],
                details=c["details"],
                raw=raw_by_source.get(c["source"]),
                checked_at=now(),
            )
        )
    session.add(
        ScoringResult(
            application_id=app.id,
            total=result["total"],
            outcome=result["outcome"],
            payload=result,
            load=load,
            created_at=now(),
        )
    )
    return result, checks, load


def decision_payload(
    app: Application,
    decision_type: str,
    decided_by: str,
    scoring_result: dict | None,
    requested_load: dict | None,
    t: Thresholds,
    *,
    offer: dict | None = None,
    reason_codes: list[str] | None = None,
) -> dict:
    """Decision из К.10. offer: {product_code, amount, term_months, rate_percent}."""
    offered = None
    if decision_type != "rejected":
        offer = offer or {
            "product_code": app.product_code,
            "amount": app.requested_amount,
            "term_months": app.requested_term_months,
            "rate_percent": float(app.rate_percent),
        }
        code, amount, term, rate = (
            offer["product_code"],
            offer["amount"],
            offer["term_months"],
            float(offer["rate_percent"]),
        )
        offered = {
            "product": product_ref(code),
            "amount": money(amount),
            "term_months": term,
            "rate_percent": rate,
            "monthly_payment": money(monthly_payment(code, amount, term, rate)),
            "overpayment": money(overpayment(code, amount, term, rate)),
        }

    factors = []
    for f in (scoring_result or {}).get("factors", []):
        impact = scoring.factor_impact(f["points"], f["max_points"])
        factors.append(
            {
                "code": f["code"],
                "title": f["title"],
                "impact": impact,
                "text": texts.factor_text(f["code"], impact, f["value_text"]),
            }
        )
    for i, stop in enumerate((scoring_result or {}).get("stop_factors", [])):
        factors.append({"code": f"stop_{i}", "title": stop, "impact": "negative", "text": stop})
    for code in reason_codes or []:
        title = REJECTION_REASON_TITLES.get(code, code)
        factors.append({"code": f"reason_{code}", "title": title, "impact": "negative", "text": title})

    negative = [f for f in factors if f["impact"] == "negative"]
    titles = [f["title"] for f in negative] if decision_type == "rejected" else []
    explanation = texts.decision_explanation(
        decision_type,
        amount=offered["amount"]["value"] if offered else None,
        term=offered["term_months"] if offered else None,
        req_amount=app.requested_amount,
        req_load=requested_load["load_percent"] if requested_load else None,
        threshold=t.load_threshold_percent,
        factor_titles=titles,
    )
    tips = []
    if decision_type != "approved":
        for f in negative:
            tip = texts.IMPROVE_TIPS.get(f["code"])
            if tip and tip not in tips:
                tips.append(tip)
        if not tips:
            tips.append(texts.IMPROVE_TIPS["debt_load"])
    return {
        "type": decision_type,
        "decided_at": iso(now()),
        "decided_by": decided_by,
        "requested": {"amount": money(app.requested_amount), "term_months": app.requested_term_months},
        "offered": offered,
        "offer_valid_until": (today() + timedelta(days=OFFER_VALID_DAYS)).isoformat() if offered else None,
        "factors": factors,
        "explanation_text": explanation,
        "improve_tips": tips[:3],
        "text_source": texts.TEMPLATE,
    }


async def apply_decision(
    session: AsyncSession, app: Application, payload: dict, actor: Actor, decided_by_user_id: uuid.UUID | None = None
) -> None:
    company = await session.get(Company, app.company_id)
    people = await People.load(session, company)
    session.add(
        Decision(
            application_id=app.id,
            type=payload["type"],
            decided_by=payload["decided_by"],
            decided_by_user_id=decided_by_user_id,
            text_source=payload["text_source"],
            payload=payload,
            created_at=now(),
        )
    )
    offered = payload["offered"]
    if offered:
        app.approved_amount = offered["amount"]["value"]
        app.approved_term_months = offered["term_months"]
        app.rate_percent = offered["rate_percent"]
        app.product_code = offered["product"]["code"]
    app.auto_decided = payload["decided_by"] == "auto"
    accept_users = people.active_with("accept_offers")
    transition(
        session,
        app,
        ApplicationStatus(payload["type"]),
        actor,
        description=payload["explanation_text"],
        notify_users=[*accept_users, app.created_by],
    )
    if payload["type"] in ("approved", "counter_offer"):
        assignee = app.created_by if app.created_by in accept_users else (accept_users[0] if accept_users else None)
        title = (
            f"Заявка {app.number} одобрена"
            if payload["type"] == "approved"
            else f"Банк предложил другие условия по заявке {app.number}"
        )
        add_task(
            session,
            company_id=app.company_id,
            type_="accept_offer",
            title=title,
            cta={"label": "Ознакомиться", "route": f"/applications/{app.id}"},
            assignee=assignee,
            application_id=app.id,
            due_at=None,
        )


async def create_info_request(
    session: AsyncSession,
    app: Application,
    *,
    question: str,
    document_types: list[str],
    due_at,
    purpose_text: str | None,
    actor: Actor,
    created_by: uuid.UUID | None,
) -> InfoRequest:
    company = await session.get(Company, app.company_id)
    people = await People.load(session, company)
    request = InfoRequest(
        id=uuid.uuid4(),
        application_id=app.id,
        question=question,
        purpose_text=purpose_text,
        document_types=document_types,
        lk_available=any(DOCUMENT_TYPES_BY_CODE.get(t, {}).get("can_generate_from_lk") for t in document_types),
        due_at=due_at,
        status="open",
        created_by=created_by,
        created_at=now(),
    )
    session.add(request)
    uploaders = people.active_with("upload_documents")
    # ответственный по умолчанию: автор заявки
    assignee = app.created_by if app.created_by in uploaders else (uploaders[0] if uploaders else None)
    transition(
        session,
        app,
        ApplicationStatus.INFO_REQUESTED,
        actor,
        description=question,
        notify_users=uploaders,
        notification_text=question,
    )
    add_task(
        session,
        company_id=app.company_id,
        type_="info_request",
        title=question,
        cta={"label": "Загрузить", "route": f"/applications/{app.id}/info-requests/{request.id}"},
        assignee=assignee,
        application_id=app.id,
        ref_id=str(request.id),
        due_at=due_at,
    )
    return request


async def auto_review(session: AsyncSession, external: ExternalSystems, app_id: uuid.UUID) -> None:
    """Поток после submit (3.5): автопроверки, недостающие документы, стоп-факторы, авторешение или очередь."""
    app = await session.get(Application, app_id, with_for_update=True)
    if app is None or app.status != ApplicationStatus.SUBMITTED:
        return
    company = await session.get(Company, app.company_id)
    data = CompanyData(session, external, company)
    result, checks, load = await run_checks(session, app, data)
    t = await thresholds(session)

    transition(
        session,
        app,
        ApplicationStatus.IN_REVIEW,
        SYSTEM,
        title="Проверка данных",
        description="Автопроверки: реестр, БКИ, обороты, ФНС, нагрузка",
    )
    app.queued_at = now()
    audit(
        session,
        actor=SYSTEM,
        action="Автопроверки и скоринг",
        entity="application",
        entity_id=app.id,
        details=f"Балл {result['total']}, рекомендация {result['outcome']}",
    )

    statuses = {c["status"] for c in checks}
    if "error" in statuses:
        # мок не ответил: решение за аналитиком
        return

    req = await requirements(session, app, data)
    missing = [i for i in req["items"] if i["necessity"] == "required" and i["status"] != "done"]
    if missing:
        types = [i["action"]["document_type"] for i in missing if i["action"] and i["action"]["document_type"]]
        await create_info_request(
            session,
            app,
            question="Приложите недостающие документы: " + ", ".join(i["title"].lower() for i in missing),
            document_types=types,
            due_at=now() + timedelta(days=5),
            purpose_text="для рассмотрения заявки",
            actor=SYSTEM,
            created_by=None,
        )
        return

    if result["stop_factors"] or result["outcome"] == "rejected":
        payload = await ai.decision_texts(decision_payload(app, "rejected", "auto", result, load, t))
        await apply_decision(session, app, payload, SYSTEM)
        return

    if result["total"] >= t.approve_min and "warning" not in statuses:
        payload = await ai.decision_texts(decision_payload(app, "approved", "auto", result, load, t))
        await apply_decision(session, app, payload, SYSTEM)


async def auto_review_job(
    session_factory: async_sessionmaker[AsyncSession], external_factory, app_id: uuid.UUID
) -> None:
    """Фоновая задача после ответа на submit: своя сессия и свой клиент к мокам."""
    try:
        async with session_factory() as session, external_factory() as external:
            await auto_review(session, external, app_id)
            await session.commit()
    except Exception:  # noqa: BLE001 - заявка останется в submitted, аналитик возьмёт её вручную
        log.exception("auto review failed for application %s", app_id)


def requested_load_for(app: Application, facts: CompanyFacts, t: Thresholds) -> dict | None:
    if not facts.finance_available:
        return None
    return load_calc(facts.free_cash_flow or 0, facts.current_payments or 0, requested_payment(app), t)


def load_value(app: Application, facts: CompanyFacts) -> float | None:
    if not facts.finance_available:
        return None
    return load_percent(requested_payment(app), facts.current_payments or 0, facts.free_cash_flow or 0)


def is_in_bank_queue(app: Application) -> bool:
    return app.status.value in sm.IN_BANK
