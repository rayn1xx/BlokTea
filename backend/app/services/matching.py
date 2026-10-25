import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import not_found, validation
from app.domain import matching as matching_domain
from app.domain import readiness as readiness_domain
from app.domain.catalog import PRODUCTS, PRODUCTS_BY_CODE, PURPOSE_TITLES
from app.domain.finance import annuity_payment, payment_schedule
from app.integrations.external import ExternalSystems, optional
from app.models import MatchingSession
from app.services import ai
from app.services.applications import ApplicationService
from app.services.common import ClientContext, iso, now, thresholds, today
from app.services.company_data import CompanyData

NEED_REQUIRED = ("purpose", "amount", "term_months", "need_type", "disbursement", "urgency")
NEED_FIELDS = (*NEED_REQUIRED, "collateral")
EXTRA_FIELDS = (
    "expected_payments",
    "other_bank_turnover_monthly",
    "own_funds",
    "collateral_details",
    "preference",
    "skipped",
)
ENUMS = {
    "purpose": tuple(PURPOSE_TITLES),
    "need_type": ("one_time", "recurring"),
    "disbursement": ("lump_sum", "tranches"),
    "urgency": ("asap", "week", "not_urgent"),
    "collateral": ("none", "real_estate", "vehicle_equipment", "purchased_asset"),
}


def products(legal_form: str | None) -> list[dict]:
    return [
        p | {"amount_min": money(p["amount_min"]), "amount_max": money(p["amount_max"])}
        for p in PRODUCTS
        if not legal_form or legal_form in p["legal_forms"]
    ]


def money(value: int) -> dict:
    return {"value": value, "currency": "RUB"}


def product(code: str) -> dict:
    p = PRODUCTS_BY_CODE.get(code)
    if p is None:
        raise not_found("Продукт не найден")
    return p | {"amount_min": money(p["amount_min"]), "amount_max": money(p["amount_max"])}


def calculate(body: dict) -> dict:
    amount = (body.get("amount") or {}).get("value")
    term = body.get("term_months")
    rate = body.get("rate_percent")
    errors = {}
    if not isinstance(amount, int) or amount <= 0:
        errors["amount"] = "Укажите сумму"
    if not isinstance(term, int) or not 1 <= term <= 360:
        errors["term_months"] = "Укажите срок в месяцах"
    if not isinstance(rate, int | float) or not 0 <= rate <= 100:
        errors["rate_percent"] = "Укажите ставку"
    if errors:
        raise validation("Проверьте поля", errors)
    return payment_schedule(amount, term, float(rate), today())


def session_view(s: MatchingSession) -> dict:
    return {
        "id": str(s.id),
        "status": s.status,
        "step": s.step,
        "need": s.need,
        "finance_confirmed": s.finance_confirmed,
        "extra": s.extra,
        "updated_at": iso(s.updated_at),
    }


EMPTY_NEED = {f: None for f in NEED_FIELDS}
EMPTY_EXTRA = {
    "expected_payments": [],
    "other_bank_turnover_monthly": None,
    "own_funds": None,
    "collateral_details": None,
    "preference": None,
    "skipped": False,
}


class MatchingService:
    def __init__(self, session: AsyncSession, external: ExternalSystems) -> None:
        self.session = session
        self.external = external

    async def create(self, ctx: ClientContext) -> dict:
        ctx.require("submit_applications", "Подбор доступен тем, кто подаёт заявки")
        invoices = await optional(self.external.invoices(ctx.company.inn)) or []
        extra = dict(EMPTY_EXTRA)
        extra["expected_payments"] = [
            {"counterparty": i["counterparty"], "amount": i["amount"], "date": i["expected_date"], "source": "alfa_lk"}
            for i in invoices
        ]
        s = MatchingSession(
            id=uuid.uuid4(),
            company_id=ctx.company.id,
            created_by=ctx.user.id,
            step=1,
            status="draft",
            need=dict(EMPTY_NEED),
            extra=extra,
            finance_confirmed=False,
            created_at=now(),
            updated_at=now(),
        )
        self.session.add(s)
        await self.session.flush()
        return session_view(s)

    async def get(self, ctx: ClientContext, session_id: uuid.UUID) -> MatchingSession:
        s = await self.session.get(MatchingSession, session_id)
        if s is None or s.company_id != ctx.company.id:
            raise not_found("Подбор не найден")
        return s

    async def patch(self, ctx: ClientContext, session_id: uuid.UUID, body: dict) -> dict:
        s = await self.get(ctx, session_id)
        if not body:
            return session_view(s)
        errors = {}
        if body.get("need") is not None:
            need = dict(s.need)
            for key, value in body["need"].items():
                if key not in NEED_FIELDS:
                    continue
                if value is not None and key in ENUMS and value not in ENUMS[key]:
                    errors[f"need.{key}"] = "Неизвестное значение"
                if (
                    key == "amount"
                    and value is not None
                    and (not isinstance(value, dict) or (value.get("value") or 0) <= 0)
                ):
                    errors["need.amount"] = "Укажите сумму"
                if key == "term_months" and value is not None and (not isinstance(value, int) or not 1 <= value <= 120):
                    errors["need.term_months"] = "Срок от 1 до 120 месяцев"
                need[key] = value
            s.need = need
        if body.get("extra") is not None:
            s.extra = {**s.extra, **{k: v for k, v in body["extra"].items() if k in EXTRA_FIELDS}}
        if body.get("finance_confirmed") is not None:
            s.finance_confirmed = bool(body["finance_confirmed"])
        if errors:
            raise validation("Проверьте поля", errors)
        step = body.get("step")
        if step is not None:
            if step not in (1, 2, 3, 4):
                raise validation("Неизвестный шаг", {"step": "1-4"})
            if step >= 2:
                missing = {f: "Обязательное поле" for f in NEED_REQUIRED if s.need.get(f) is None}
                if missing:
                    raise validation("Заполните обязательные поля", missing)
            if step >= 3 and not s.finance_confirmed:
                raise validation("Подтвердите, что данные актуальны", {"finance_confirmed": "Отметьте галочку"})
            s.step = step
        s.updated_at = now()
        return session_view(s)

    async def recommend(self, ctx: ClientContext, session_id: uuid.UUID) -> dict:
        s = await self.get(ctx, session_id)
        missing = {f: "Обязательное поле" for f in NEED_REQUIRED if s.need.get(f) is None}
        if missing:
            raise validation("Заполните обязательные поля", missing)
        data = CompanyData(self.session, self.external, ctx.company)
        facts, _ = await data.facts()
        if not facts.finance_available:
            raise validation("Нет данных об оборотах из Альфа-Бизнеса, подбор недоступен", {"finance": "Нет данных"})
        t = await thresholds(self.session)
        amount, term = s.need["amount"]["value"], s.need["term_months"]
        readiness_items = readiness_domain.items(facts, t, annuity_payment(amount, term, 15.0))
        summary = await data.finance_summary()
        try:
            result = matching_domain.recommend(s.need, s.extra, facts, t, readiness_items, summary["stale"]["text"])
        except matching_domain.NoProductsError as e:
            raise validation("Нет подходящих продуктов для вашей компании", {"need": "Измените параметры"}) from e
        result = await ai.recommendation_texts(result, t.load_threshold_percent, t.load_target_percent)
        full = readiness_domain.readiness(facts, t, result["requested"]["load"]["new_payment"]["value"], iso(now()))
        response = {"session_id": str(s.id), **result, "readiness": readiness_domain.short(full)}
        s.last_recommendation = response
        s.status = "completed"
        s.step = 4
        s.updated_at = now()
        return response

    async def preapproved(self, ctx: ClientContext) -> dict | None:
        offer = await ApplicationService(self.session, self.external).preapproved_offer(ctx)
        if offer is None:
            return None
        p = PRODUCTS_BY_CODE[offer["product_code"]]
        return {
            "offer_id": offer["offer_id"],
            "product": {"code": p["code"], "name": p["name"]},
            "limit": offer["limit"],
            "term_months": offer["term_months"],
            "valid_until": offer["valid_until"],
            "conditions_fixed": offer.get("conditions_fixed", True),
            "source": "alfa_lk",
        }
