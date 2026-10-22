"""Данные компании из моков и кабинета: финансы (3.1), факты для скоринга и готовности, профиль (К.4)."""

from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError
from app.domain import texts
from app.domain.catalog import DOCUMENT_TYPES_BY_CODE
from app.domain.facts import CompanyFacts, MonthFlow, low_months
from app.integrations.external import ExternalSystems, IntegrationUnavailable, optional
from app.models import Company, CompanyProfile, Document, FinanceOverride
from app.services.common import iso, last_full_months, money, today

EXPIRING_DAYS = 180

STALE_TEXT = "Бухгалтерской отчётности за 2025 год пока нет. Без неё сумма может быть ниже"


def effective_document_status(doc: Document, day: date) -> tuple[str, str | None]:
    """Статус документа с учётом срока действия и max_age_days типа."""
    if doc.status in ("rejected", "analyzing"):
        return doc.status, doc.status_reason
    doc_type = DOCUMENT_TYPES_BY_CODE.get(doc.document_type, {})
    max_age = doc_type.get("max_age_days")
    if max_age and doc.origin == "upload" and (day - doc.uploaded_at.date()).days > max_age:
        return "rejected", texts.ISSUE_TEXTS["not_expired"].format(days=max_age)
    if doc.expires_at and doc.expires_at < day:
        return "rejected", "Срок действия документа истёк"
    if doc.expires_at and (doc.expires_at - day).days <= EXPIRING_DAYS:
        return "expiring", f"Действует до {doc.expires_at.strftime('%d.%m.%Y')}"
    return doc.status, doc.status_reason


def document_valid(doc: Document, day: date) -> bool:
    status, _ = effective_document_status(doc, day)
    return status not in ("rejected",)


def required_company_documents(legal_form: str) -> list[str]:
    return ["charter", "director_decision"] if legal_form == "OOO" else []


def statements_document(legal_form: str) -> str:
    return "fin_statements_2025" if legal_form == "OOO" else "tax_return"


class CompanyData:
    def __init__(self, session: AsyncSession, external: ExternalSystems, company: Company) -> None:
        self.session = session
        self.external = external
        self.company = company
        self._profile: CompanyProfile | None = None
        self._documents: list[Document] | None = None

    @property
    def inn(self) -> str:
        return self.company.inn

    async def profile(self) -> CompanyProfile:
        if self._profile is None:
            self._profile = await self.session.get(CompanyProfile, self.company.id)
            if self._profile is None:
                self._profile = CompanyProfile(
                    company_id=self.company.id,
                    registry_confirmed=False,
                    client_input={},
                    completeness_percent=60,
                    onboarding_completed=False,
                )
                self.session.add(self._profile)
        return self._profile

    async def overrides(self) -> dict[str, FinanceOverride]:
        rows = await self.session.scalars(
            select(FinanceOverride)
            .where(FinanceOverride.company_id == self.company.id)
            .order_by(FinanceOverride.created_at)
        )
        return {row.field: row for row in rows}

    async def documents(self) -> list[Document]:
        if self._documents is None:
            self._documents = list(
                await self.session.scalars(select(Document).where(Document.company_id == self.company.id))
            )
        return self._documents

    async def has_valid_document(self, doc_type: str) -> bool:
        day = today()
        return any(d.document_type == doc_type and document_valid(d, day) for d in await self.documents())

    async def statements_needed(self) -> bool:
        """Отчётность за 2025 ситуативна: для ИП не нужна при Альфа-Бухгалтерии."""
        if self.company.legal_form.value == "IP":
            accounting = await optional(self.external.accounting(self.inn))
            if accounting and accounting.get("alfa_accounting"):
                return False
        return True

    async def document_gaps(self) -> tuple[list[str], list[str]]:
        required = [
            c for c in required_company_documents(self.company.legal_form.value) if not await self.has_valid_document(c)
        ]
        situational = []
        statements = statements_document(self.company.legal_form.value)
        if await self.statements_needed() and not await self.has_valid_document(statements):
            situational.append(statements)
        return required, situational

    # финансы

    async def months(self) -> tuple[date, date, list[MonthFlow]]:
        start, end = last_full_months(today())
        transactions = await self.external.transactions(self.inn, start, end)
        inflow: dict[str, int] = defaultdict(int)
        outflow: dict[str, int] = defaultdict(int)
        for tx in transactions:
            month = tx["date"][:7]
            # без переводов между своими счетами, поступлений кредитов и платежей по кредитам
            if tx["category"] == "inflow":
                inflow[month] += tx["amount"]["value"]
            elif tx["category"] == "outflow_operating":
                outflow[month] += tx["amount"]["value"]
        result = []
        cursor = start
        while cursor <= end:
            key = cursor.strftime("%Y-%m")
            result.append(MonthFlow(key, inflow.get(key, 0), outflow.get(key, 0)))
            cursor = (cursor + timedelta(days=32)).replace(day=1)
        return start, end, result

    async def debts(self) -> tuple[list[dict], bool]:
        """Кредиты Альфы (ЛК) + кредиты в других банках (БКИ) + добавленные клиентом. Второе значение: БКИ ответило."""
        items = []
        for loan in await self.external.loans(self.inn):
            items.append(
                {
                    "lender": f"Альфа-Банк, {loan['product'].lower()}",
                    "source": "alfa_lk",
                    "balance": loan["balance"],
                    "monthly_payment": loan["monthly_payment"],
                    "overdue": bool(loan.get("overdue")),
                }
            )
        bki = await optional(self.external.bki(self.inn))
        bki_lenders = set()
        for ob in (bki or {}).get("obligations", []):
            bki_lenders.add(ob["lender"].lower())
            items.append(
                {
                    "lender": f"{ob['lender']} (по данным БКИ)",
                    "source": "bki",
                    "balance": ob["balance"],
                    "monthly_payment": ob["monthly_payment"],
                    "overdue": ob.get("overdue_days_current", 0) > 0,
                }
            )
        profile = await self.profile()
        for debt in (profile.client_input or {}).get("external_debts", []):
            # кредит, добавленный клиентом, учитываем, только если его нет в БКИ
            if debt["lender"].lower() in bki_lenders:
                continue
            items.append({**debt, "source": "client", "overdue": False})
        return items, bki is not None

    async def finance_summary(self) -> dict:
        """FinanceSummary из К.4. Без операций из Альфа-Бизнеса считать нечего: 503."""
        try:
            start, end, months = await self.months()
            debts, _ = await self.debts()
            multibank = await self.external.multibank(self.inn)
        except IntegrationUnavailable as e:
            raise ApiError(
                503, "INTEGRATION_UNAVAILABLE", "Данные Альфа-Бизнеса временно недоступны", {"system": e.system}
            ) from e

        overrides = await self.overrides()
        as_of = iso(end)
        count = len(months) or 1
        inflow_avg = sum(m.inflow for m in months) // count
        outflow_avg = sum(m.outflow for m in months) // count

        def sourced_money(field: str, computed: int) -> dict:
            if field in overrides:
                o = overrides[field]
                return {"value": o.value, "source": "client", "as_of": iso(o.created_at.date()), "editable": True}
            return {"value": money(computed), "source": "alfa_lk", "as_of": as_of, "editable": True}

        inflow_s = sourced_money("monthly_inflow_avg", inflow_avg)
        outflow_s = sourced_money("monthly_operating_outflow_avg", outflow_avg)
        free = inflow_s["value"]["value"] - outflow_s["value"]["value"]
        lows = low_months(months)
        profile = await self.profile()
        stale_needed = await self.statements_needed() and not await self.has_valid_document(
            statements_document(self.company.legal_form.value)
        )
        return {
            "period": {"from": start.isoformat(), "to": end.isoformat()},
            "monthly_inflow_avg": inflow_s,
            "monthly_operating_outflow_avg": outflow_s,
            "free_cash_flow": {"value": money(free), "source": "system", "as_of": as_of, "editable": False},
            "months": [{"month": m.month, "inflow": money(m.inflow), "outflow": money(m.outflow)} for m in months],
            "seasonality": {"low_months": lows, "text": texts.seasonality_text(lows)} if lows else None,
            "debts": {
                "items": debts,
                "total_monthly_payment": money(sum(d["monthly_payment"]["value"] for d in debts)),
            },
            "multibank_connected": bool(multibank.get("connected")),
            "stale": {"reason": "no_fin_statements_2025", "text": STALE_TEXT}
            if stale_needed
            else {"reason": None, "text": None},
            "confirmed_at": iso(profile.finance_confirmed_at),
        }

    async def facts(self) -> tuple[CompanyFacts, dict]:
        """Факты для скоринга и готовности и признаки доступности источников."""
        c = self.company
        registry = await optional(self.external.registry(self.inn))
        bki = await optional(self.external.bki(self.inn))
        fns = await optional(self.external.fns(self.inn))
        msp = await optional(self.external.msp(self.inn))

        finance_ok = True
        try:
            _, _, months = await self.months()
            debts, bki_ok = await self.debts()
        except IntegrationUnavailable:
            finance_ok, months, debts, bki_ok = False, [], [], False

        overrides = await self.overrides()
        inflow = outflow = current = None
        if finance_ok:
            count = len(months) or 1
            inflow = sum(m.inflow for m in months) // count
            outflow = sum(m.outflow for m in months) // count
            if "monthly_inflow_avg" in overrides:
                inflow = overrides["monthly_inflow_avg"].value["value"]
            if "monthly_operating_outflow_avg" in overrides:
                outflow = overrides["monthly_operating_outflow_avg"].value["value"]
            current = sum(d["monthly_payment"]["value"] for d in debts) if bki_ok else None

        obligations = (bki or {}).get("obligations", [])
        required, situational = await self.document_gaps()
        facts = CompanyFacts(
            legal_form=c.legal_form.value,
            okved_main=c.okved_main,
            registration_date=c.registration_date,
            today=today(),
            registry_status=registry["status"] if registry else None,
            msp_category=msp["category"] if msp else (c.msp_category.value if c.msp_category else None),
            monthly_inflow_avg=inflow,
            monthly_outflow_avg=outflow,
            current_payments=current,
            months=months,
            overdue_days_current=max((o.get("overdue_days_current", 0) for o in obligations), default=0)
            if bki
            else None,
            max_overdue_days_12m=max((o.get("max_overdue_days_12m", 0) for o in obligations), default=0)
            if bki
            else None,
            tax_debt=fns["tax_debt"]["value"] if fns else None,
            mass_address=bool(fns and fns.get("mass_address")),
            missing_required_documents=required,
            missing_situational_documents=situational,
        )
        availability = {
            "registry_ok": registry is not None,
            "bki_ok": bki is not None,
            "fns_ok": fns is not None,
            "finance_ok": finance_ok and bki_ok,
            "raw": {"registry": registry, "bki": bki, "fns": fns, "msp": msp},
        }
        return facts, availability

    async def company_profile(self, available_actions: list[str]) -> dict:
        """CompanyProfile из К.4."""
        c = self.company
        profile = await self.profile()
        overrides = await self.overrides()
        registry = await optional(self.external.registry(self.inn))
        payroll = await optional(self.external.payroll(self.inn))
        accounting = await optional(self.external.accounting(self.inn))
        loans = await optional(self.external.loans(self.inn))

        def sourced(field: str, value, source: str, as_of: str | None, editable: bool = True) -> dict:
            if field in overrides:
                o = overrides[field]
                return {"value": o.value, "source": "client", "as_of": iso(o.created_at.date()), "editable": True}
            return {"value": value, "source": source, "as_of": as_of, "editable": editable}

        inflow = None
        try:
            start, end, months = await self.months()
            inflow = sum(m.inflow for m in months) // (len(months) or 1)
            inflow_as_of = iso(end)
        except IntegrationUnavailable:
            inflow_as_of = None

        client_input = profile.client_input or {}
        return {
            "company": await company_view(self.session, c),
            "registry": {
                "source": "EGRIP" if c.legal_form.value == "IP" else "EGRUL",
                "fetched_at": registry["fetched_at"] if registry else iso(c.verification.verified_at),
                "confirmed": profile.registry_confirmed,
                "issue_comment": profile.issue_comment,
            },
            "from_lk": {
                "employees_count": sourced(
                    "employees_count",
                    payroll["employees_count"] if payroll else c.employees_count,
                    "alfa_lk" if payroll else "system",
                    payroll["as_of"] if payroll else None,
                ),
                "monthly_inflow_avg": sourced(
                    "monthly_inflow_avg",
                    money(inflow or 0),
                    "alfa_lk" if inflow is not None else "system",
                    inflow_as_of,
                ),
                "tax_regime": sourced(
                    "tax_regime",
                    accounting["tax_regime"] if accounting else None,
                    "alfa_lk" if accounting else "system",
                    accounting["as_of"] if accounting else None,
                ),
                "alfa_loans": {
                    "value": {
                        "count": len(loans or []),
                        "monthly_payment": money(sum(x["monthly_payment"]["value"] for x in loans or [])),
                    },
                    "source": "alfa_lk" if loans is not None else "system",
                    "as_of": iso(today()) if loans is not None else None,
                    "editable": False,
                },
            },
            "client_input": {
                "external_debts": client_input.get("external_debts", []),
                "collateral_available": client_input.get("collateral_available", []),
            },
            "completeness_percent": profile.completeness_percent,
            "available_actions": available_actions,
        }

    async def recalc_completeness(self) -> None:
        profile = await self.profile()
        ci = profile.client_input or {}
        percent = 60
        if profile.registry_confirmed:
            percent += 20
        if ci.get("external_debts") or ci.get("collateral_available") or await self.overrides():
            percent += 10
        if profile.onboarding_completed:
            percent += 10
        profile.completeness_percent = min(percent, 100)


async def company_view(session: AsyncSession, c: Company) -> dict:
    """Company из К.3."""
    from app.models import Member, User

    director = None
    if c.director_user_id:
        user = await session.get(User, c.director_user_id)
        member = await session.scalar(
            select(Member).where(Member.user_id == c.director_user_id, Member.company_id == c.id)
        )
        if user:
            director = {
                "user_id": str(user.id),
                "name": user.short_name,
                "role": member.role.value if member else "director",
            }
    return {
        "id": str(c.id),
        "legal_form": c.legal_form.value,
        "inn": c.inn,
        "ogrn": c.ogrn,
        "kpp": c.kpp,
        "full_name": c.full_name,
        "short_name": c.short_name,
        "registration_date": c.registration_date.isoformat(),
        "okved_main": c.okved_main,
        "okved_additional": list(c.okved_additional or []),
        "legal_address": c.legal_address,
        "registry_status": c.registry_status.value,
        "msp_category": c.msp_category.value if c.msp_category else None,
        "employees_count": c.employees_count,
        "director": director,
        "verification": {"source": c.verification.source, "verified_at": iso(c.verification.verified_at)},
        "created_at": iso(c.created_at),
        "updated_at": iso(c.updated_at),
    }
