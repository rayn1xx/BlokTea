from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import validation
from app.domain import readiness as readiness_domain
from app.domain.finance import annuity_payment
from app.integrations.external import ExternalSystems
from app.models import FinanceOverride
from app.services import ai
from app.services.common import ClientContext, iso, now, thresholds
from app.services.company_data import CompanyData
from app.services.events import Actor, audit
from app.services.home import HomeService

EDIT_ROLES = ["owner", "director", "cfo_or_accountant"]
TAX_REGIMES = ("osn", "usn_income", "usn_income_expense", "patent", "ausn")
COLLATERAL_TYPES = ("none", "real_estate", "vehicle_equipment", "purchased_asset")


def profile_actions(ctx: ClientContext) -> list[str]:
    actions = []
    if ctx.member.role.value == "owner":
        actions.append("company.confirm_registry")
    if ctx.member.role.value in EDIT_ROLES:
        actions.append("company.edit_details")
    return actions


def actor(ctx: ClientContext) -> Actor:
    return Actor("client", ctx.user.id, ctx.user.short_name)


class CompanyService:
    def __init__(self, session: AsyncSession, external: ExternalSystems) -> None:
        self.session = session
        self.external = external

    def data(self, ctx: ClientContext) -> CompanyData:
        return CompanyData(self.session, self.external, ctx.company)

    async def profile(self, ctx: ClientContext) -> dict:
        return await self.data(ctx).company_profile(profile_actions(ctx))

    async def confirm_registry(self, ctx: ClientContext, body: dict) -> dict:
        ctx.require_role(["owner"], "Данные из реестра подтверждает собственник")
        confirmed = bool(body.get("confirmed"))
        comment = (body.get("issue_comment") or "").strip()
        if not confirmed and not comment:
            raise validation("Опишите, что не так", {"issue_comment": "Обязательное поле"})
        data = self.data(ctx)
        profile = await data.profile()
        profile.registry_confirmed = confirmed
        profile.issue_comment = None if confirmed else comment
        await data.recalc_completeness()
        audit(
            self.session,
            actor=actor(ctx),
            action="Подтверждение данных реестра" if confirmed else "Замечание к данным реестра",
            entity="company",
            entity_id=ctx.company.id,
            details=comment or None,
        )
        return await data.company_profile(profile_actions(ctx))

    def override(self, ctx: ClientContext, field: str, value) -> None:
        self.session.add(
            FinanceOverride(
                company_id=ctx.company.id, field=field, value=value, created_by=ctx.user.id, created_at=now()
            )
        )

    async def patch_details(self, ctx: ClientContext, body: dict) -> dict:
        ctx.require_role(EDIT_ROLES, "Данные компании меняют собственник, директор или бухгалтер")
        data = self.data(ctx)
        profile = await data.profile()
        client_input = dict(profile.client_input or {})
        errors = {}
        if "external_debts" in body:
            debts = body["external_debts"] or []
            for i, d in enumerate(debts):
                if not (d.get("lender") and d.get("monthly_payment", {}).get("value") is not None):
                    errors[f"external_debts.{i}"] = "Укажите кредитора и платёж"
            client_input["external_debts"] = [
                {
                    "lender": d.get("lender", ""),
                    "balance": d.get("balance") or {"value": 0, "currency": "RUB"},
                    "monthly_payment": d.get("monthly_payment"),
                }
                for d in debts
            ]
        if "collateral_available" in body:
            bad = [c for c in body["collateral_available"] or [] if c not in COLLATERAL_TYPES]
            if bad:
                errors["collateral_available"] = "Неизвестный вид залога"
            client_input["collateral_available"] = body["collateral_available"] or []
        if body.get("tax_regime") is not None and body["tax_regime"] not in TAX_REGIMES:
            errors["tax_regime"] = "Неизвестный налоговый режим"
        if errors:
            raise validation("Проверьте поля", errors)
        profile.client_input = client_input
        for field in ("employees_count", "monthly_inflow_avg", "tax_regime"):
            if field in body:
                self.override(ctx, field, body[field])
        await self.session.flush()
        await data.recalc_completeness()
        return await data.company_profile(profile_actions(ctx))

    async def complete_onboarding(self, ctx: ClientContext, skipped: bool) -> dict:
        ctx.require_role(["owner"], "Онбординг проходит собственник")
        data = self.data(ctx)
        profile = await data.profile()
        profile.onboarding_completed = True
        await data.recalc_completeness()
        audit(
            self.session,
            actor=actor(ctx),
            action="Онбординг пропущен" if skipped else "Онбординг завершён",
            entity="company",
            entity_id=ctx.company.id,
        )
        await self.session.flush()
        home = await HomeService(self.session).get_home(ctx.user)
        return home["onboarding"]

    async def finance_summary(self, ctx: ClientContext) -> dict:
        return await self.data(ctx).finance_summary()

    async def patch_finance(self, ctx: ClientContext, body: dict) -> dict:
        edits = body.get("debts_add") or any(
            body.get(f) is not None for f in ("monthly_inflow_avg", "monthly_operating_outflow_avg")
        )
        if edits or not ctx.has("submit_applications"):
            ctx.require_role(EDIT_ROLES, "Финансовые данные меняют собственник, директор или бухгалтер")
        data = self.data(ctx)
        for field in ("monthly_inflow_avg", "monthly_operating_outflow_avg"):
            if body.get(field) is not None:
                value = body[field]
                if not isinstance(value, dict) or not isinstance(value.get("value"), int) or value["value"] < 0:
                    raise validation("Проверьте поля", {field: "Сумма в копейках"})
                self.override(ctx, field, {"value": value["value"], "currency": "RUB"})
        if body.get("debts_add"):
            profile = await data.profile()
            client_input = dict(profile.client_input or {})
            debts = list(client_input.get("external_debts", []))
            for d in body["debts_add"]:
                if not d.get("lender") or not (d.get("monthly_payment") or {}).get("value"):
                    raise validation("Проверьте поля", {"debts_add": "Укажите кредитора и платёж"})
                debts.append(
                    {
                        "lender": d["lender"],
                        "balance": d.get("balance") or {"value": 0, "currency": "RUB"},
                        "monthly_payment": d["monthly_payment"],
                    }
                )
            client_input["external_debts"] = debts
            profile.client_input = client_input
        if body.get("confirm"):
            (await data.profile()).finance_confirmed_at = now()
        await self.session.flush()
        audit(
            self.session,
            actor=actor(ctx),
            action="Изменены финансовые данные",
            entity="company",
            entity_id=ctx.company.id,
        )
        return await data.finance_summary()

    async def readiness(self, ctx: ClientContext, amount: int | None, term: int | None, rate: float) -> dict:
        facts, _ = await self.data(ctx).facts()
        payment = annuity_payment(amount, term, rate) if amount and term else 0
        full = readiness_domain.readiness(facts, await thresholds(self.session), payment, iso(now()))
        return await ai.readiness_texts(full)
