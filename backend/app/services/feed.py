"""Лента (3.11: отбор правилами, без LLM), уведомления и кредиты (К.11, К.13)."""

import math
import uuid
from datetime import date, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import not_found
from app.domain import readiness as readiness_domain
from app.domain.catalog import PRODUCTS_BY_CODE
from app.domain.facts import low_months
from app.domain.finance import payment_schedule
from app.integrations.external import ExternalSystems, optional
from app.models import Application, ApplicationEvent, FeedItem, Loan, Notification, User
from app.services.application_view import product_ref
from app.services.common import ClientContext, iso, money, now, thresholds
from app.services.company_data import CompanyData

LEGAL_FORM_TITLES = {"OOO": "ООО", "IP": "ИП"}
MSP_TITLES = {"micro": "микропредприятие", "small": "малое предприятие", "medium": "среднее предприятие"}


def matches(item: FeedItem, ctx: ClientContext, readiness_items: list[dict], has_seasonality: bool) -> str | None:
    """Причина показа или None, если материал компании не подходит."""
    t = item.targeting or {}
    c = ctx.company
    legal_form = c.legal_form.value
    okved = c.okved_main.split()[0] if c.okved_main else ""
    if t.get("legal_forms") and legal_form not in t["legal_forms"]:
        return None
    if t.get("reason"):
        # материал для всей формы бизнеса: причина задана в targeting
        return f"Показано, потому что: {t['reason']}"
    if item.type in ("program", "industry"):
        prefixes = t.get("okved_prefixes") or []
        if prefixes and not any(okved.startswith(p) for p in prefixes):
            return None
        categories = t.get("msp_categories") or []
        msp = c.msp_category.value if c.msp_category else None
        if categories and msp not in categories:
            return None
        if prefixes:
            return f"Показано, потому что: ваш ОКВЭД {okved}"
        if categories:
            return f"Показано, потому что: вы {MSP_TITLES.get(msp, 'малый бизнес')}"
        return "Показано, потому что: подходит вашему бизнесу"
    if item.type == "product_update":
        product = PRODUCTS_BY_CODE.get(t.get("product_code", ""))
        if product is None or legal_form not in product["legal_forms"]:
            return None
        return f"Показано, потому что: продукт доступен для {LEGAL_FORM_TITLES[legal_form]}"
    if item.type == "tip":
        if t.get("seasonality"):
            return "Показано, потому что: у вас сезонный спад поступлений" if has_seasonality else None
        code = t.get("readiness_warning")
        hit = next((i for i in readiness_items if i["code"] == code and i["status"] == "warning"), None)
        if hit is None:
            return None
        return f"Показано, потому что: {hit['title'].lower()}: {hit['value_text']}"
    return None


class FeedService:
    def __init__(self, session: AsyncSession, external: ExternalSystems) -> None:
        self.session = session
        self.external = external

    async def feed(self, ctx: ClientContext, type_: str | None, page: int, page_size: int) -> dict:
        data = CompanyData(self.session, self.external, ctx.company)
        facts, _ = await data.facts()
        readiness_items = readiness_domain.items(facts, await thresholds(self.session), 0)
        has_seasonality = bool(low_months(facts.months))
        items = []
        for row in await self.session.scalars(select(FeedItem).order_by(FeedItem.published_at.desc())):
            reason = matches(row, ctx, readiness_items, has_seasonality)
            if reason:
                items.append(
                    {
                        "id": str(row.id),
                        "type": row.type,
                        "title": row.title,
                        "body": row.body,
                        "published_at": iso(row.published_at),
                        "tags": list(row.tags or []),
                        "relevance_reason": reason,
                        "cta": row.cta,
                    }
                )
        # события по заявкам компании
        events = await self.session.execute(
            select(ApplicationEvent, Application)
            .join(Application, Application.id == ApplicationEvent.application_id)
            .where(Application.company_id == ctx.company.id, ApplicationEvent.from_status.is_not(None))
            .order_by(ApplicationEvent.at.desc())
            .limit(50)
        )
        # по одному последнему событию на заявку, чтобы лента не превращалась в таймлайн
        latest = {}
        for event, app in events.all():
            latest.setdefault(app.id, (event, app))
        for event, app in list(latest.values())[:3]:
            items.append(
                {
                    "id": f"event-{event.id}",
                    "type": "application_event",
                    "title": f"Заявка {app.number}: {event.title.lower()}",
                    "body": event.description or f"{product_ref(app.product_code)['name']}, {app.purpose.lower()}",
                    "published_at": iso(event.at),
                    "tags": ["заявка"],
                    "relevance_reason": "Показано, потому что: это заявка вашей компании",
                    "cta": {"label": "Открыть", "route": f"/applications/{app.id}"},
                }
            )
        items.sort(key=lambda i: i["published_at"], reverse=True)
        if type_:
            items = [i for i in items if i["type"] == type_]
        start = (page - 1) * page_size
        return {"items": items[start : start + page_size], "page": page, "page_size": page_size, "total": len(items)}

    # уведомления

    async def notifications(self, user: User, unread: bool) -> list[dict]:
        filters = [Notification.user_id == user.id]
        if unread:
            filters.append(Notification.read.is_(False))
        rows = await self.session.scalars(
            select(Notification).where(*filters).order_by(Notification.created_at.desc()).limit(100)
        )
        return [
            {
                "id": str(n.id),
                "created_at": iso(n.created_at),
                "read": n.read,
                "title": n.title,
                "text": n.text,
                "application_id": str(n.application_id) if n.application_id else None,
                "route": n.route,
            }
            for n in rows
        ]

    async def read(self, user: User, notification_id: uuid.UUID) -> None:
        n = await self.session.get(Notification, notification_id)
        if n is None or n.user_id != user.id:
            raise not_found("Уведомление не найдено")
        n.read = True

    async def read_all(self, user: User) -> None:
        await self.session.execute(update(Notification).where(Notification.user_id == user.id).values(read=True))

    # кредиты

    def loan_view(self, loan: Loan, with_schedule: bool) -> dict:
        upcoming = next((r for r in loan.schedule if r["date"] >= now().date().isoformat()), None)
        return {
            "id": str(loan.id),
            "application_id": str(loan.application_id) if loan.application_id else None,
            "product": product_ref(loan.product_code),
            "amount": money(loan.amount),
            "balance": money(loan.balance),
            "rate_percent": float(loan.rate_percent),
            "term_months": loan.term_months,
            "next_payment": {"date": upcoming["date"], "amount": upcoming["payment"]} if upcoming else None,
            "overpayment_total": money(loan.overpayment_total),
            "issued_to_account": loan.issued_to_account,
            "schedule": loan.schedule if with_schedule else [],
            "source": loan.source,
        }

    @staticmethod
    def alfa_loan_view(loan: dict, with_schedule: bool) -> dict:
        monthly = loan["monthly_payment"]["value"]
        balance = loan["balance"]["value"]
        schedule = []
        if with_schedule and monthly:
            months = max(1, math.ceil(balance / monthly))
            first = date.fromisoformat(loan["next_payment_date"])
            # график по остатку: первый платёж в ближайшую дату из ЛК
            schedule = payment_schedule(balance, months, loan["rate_percent"], first - timedelta(days=31))["schedule"]
            for i, row in enumerate(schedule):
                y, m = divmod(first.month - 1 + i, 12)
                row["date"] = date(first.year + y, m + 1, min(first.day, 28)).isoformat()
        code = loan.get("product_code") or "any_purpose"
        return {
            "id": loan["id"],
            "application_id": None,
            "product": {"code": code, "name": loan["product"]},
            "amount": loan["amount"],
            "balance": loan["balance"],
            "rate_percent": loan["rate_percent"],
            "term_months": loan["term_months"],
            "next_payment": {"date": loan["next_payment_date"], "amount": loan["monthly_payment"]},
            "overpayment_total": money(max(monthly * loan["term_months"] - loan["amount"]["value"], 0)),
            "issued_to_account": loan.get("account_mask", ""),
            "schedule": schedule,
            "source": "alfa_lk",
        }

    async def loans(self, ctx: ClientContext) -> list[dict]:
        rows = await self.session.scalars(
            select(Loan).where(Loan.company_id == ctx.company.id).order_by(Loan.created_at.desc())
        )
        result = [self.loan_view(loan, False) for loan in rows]
        for loan in await optional(self.external.loans(ctx.company.inn)) or []:
            result.append(self.alfa_loan_view(loan, False))
        return result

    async def loan(self, ctx: ClientContext, loan_id: str) -> dict:
        if loan_id.startswith("alfa-"):
            loans = await optional(self.external.loans(ctx.company.inn)) or []
            loan = next((x for x in loans if x["id"] == loan_id), None)
            if loan is None:
                raise not_found("Кредит не найден")
            return self.alfa_loan_view(loan, True)
        try:
            loan = await self.session.get(Loan, uuid.UUID(loan_id))
        except ValueError:
            loan = None
        if loan is None or loan.company_id != ctx.company.id:
            raise not_found("Кредит не найден")
        return self.loan_view(loan, True)
