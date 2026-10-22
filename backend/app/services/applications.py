"""Заявки клиента (К.8, К.9, К.11): создание, черновик, согласия, отправка, решение, подписание и выдача."""

import uuid
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError, forbidden, invalid_transition, not_found, validation
from app.domain import state_machine as sm
from app.domain.catalog import PRODUCTS_BY_CODE, PURPOSE_TITLES, roles_with
from app.domain.finance import payment_schedule
from app.integrations.external import ExternalSystems, optional
from app.models import (
    Application,
    ApplicationStatus,
    Consent,
    Document,
    InfoRequest,
    Loan,
    MatchingSession,
    SigningRules,
    SigningSession,
)
from app.services import challenges
from app.services.application_view import (
    SIGN_DOC_ACCUSATIVE,
    AppExtras,
    available_actions,
    detail,
    info_request_view,
    load_extras,
    requirements,
    signing_state,
    summary,
)
from app.services.common import ClientContext, People, iso, now, parse_dt, thresholds, today
from app.services.company_data import CompanyData
from app.services.events import Actor, add_event, add_task, audit, close_tasks, notify, transition
from app.services.review import requested_load_for
from app.services.tasks import task_view

ACTION_ROLES = {
    "application.submit": roles_with("submit_applications"),
    "application.cancel": roles_with("submit_applications"),
    "application.edit": roles_with("submit_applications"),
    "application.handoff": roles_with("upload_documents"),
    "offer.accept": roles_with("accept_offers"),
    "offer.decline": roles_with("accept_offers"),
    "consent.sign": sorted(set(roles_with("submit_applications")) | set(roles_with("sign"))),
    "info_request.respond": roles_with("upload_documents"),
    "signing.sign": roles_with("sign"),
    "signing.remind": ["owner", "director", "financing_employee"],
}

PERMISSION_FOR_ACTION = {
    "application.submit": "submit_applications",
    "application.cancel": "submit_applications",
    "offer.accept": "accept_offers",
    "offer.decline": "accept_offers",
    "info_request.respond": "upload_documents",
    "application.handoff": "upload_documents",
}


@dataclass
class ApplicationQuery:
    statuses: list[str] = field(default_factory=list)
    page: int = 1
    page_size: int = 10
    sort_field: str = "created_at"
    descending: bool = True


def actor_of(ctx: ClientContext) -> Actor:
    return Actor("client", ctx.user.id, ctx.user.short_name)


class ApplicationService:
    def __init__(self, session: AsyncSession, external: ExternalSystems) -> None:
        self.session = session
        self.external = external

    # чтение

    async def get_app(self, ctx: ClientContext, app_id: uuid.UUID, *, lock: bool = False) -> Application:
        app = await self.session.get(Application, app_id, with_for_update=lock)
        if app is None or app.company_id != ctx.company.id:
            raise not_found("Заявка не найдена")
        return app

    async def require_action(self, ctx: ClientContext, app: Application, action: str) -> AppExtras:
        extras = (await load_extras(self.session, [app]))[app.id]
        if action in available_actions(app, ctx, extras):
            return extras
        permission = PERMISSION_FOR_ACTION.get(action)
        if permission and not ctx.has(permission):
            raise forbidden("Действие недоступно для вашей роли", ACTION_ROLES.get(action, []))
        if action == "consent.sign" and not (ctx.has("submit_applications") or ctx.has("sign")):
            raise forbidden("Согласие подписывает уполномоченное лицо", ACTION_ROLES["consent.sign"])
        raise invalid_transition(f"Действие недоступно для заявки в статусе {app.status.value}")

    async def list(self, ctx: ClientContext, query: ApplicationQuery) -> dict:
        company_filter = Application.company_id == ctx.company.id
        filters = [company_filter]
        if query.statuses:
            filters.append(Application.status.in_(query.statuses))
        total = await self.session.scalar(select(func.count()).select_from(Application).where(*filters)) or 0
        column = {
            "created_at": Application.created_at,
            "updated_at": Application.updated_at,
            "requested_amount": Application.requested_amount,
        }[query.sort_field]
        order = (column.desc(), Application.id.desc()) if query.descending else (column.asc(), Application.id.asc())
        apps = list(
            await self.session.scalars(
                select(Application)
                .where(*filters)
                .order_by(*order)
                .limit(query.page_size)
                .offset((query.page - 1) * query.page_size)
            )
        )
        counts = dict(
            (
                await self.session.execute(
                    select(Application.status, func.count()).where(company_filter).group_by(Application.status)
                )
            ).all()
        )

        def count(group: tuple[str, ...]) -> int:
            return sum(n for status, n in counts.items() if status.value in group)

        extras = await load_extras(self.session, apps)
        people = await People.load(self.session, ctx.company)
        return {
            "items": [summary(a, ctx, extras[a.id], people) for a in apps],
            "page": query.page,
            "page_size": query.page_size,
            "total": total,
            "counters": {
                "drafts": count(sm.DRAFTS),
                "in_bank": count(sm.IN_BANK),
                "awaiting_signing": count(sm.AWAITING_SIGNING),
                "finished": count(sm.FINISHED),
            },
        }

    async def detail(self, ctx: ClientContext, app: Application) -> dict:
        people = await People.load(self.session, ctx.company)
        return await detail(self.session, app, ctx, people, ctx.user.id)

    def data(self, ctx: ClientContext) -> CompanyData:
        return CompanyData(self.session, self.external, ctx.company)

    # создание

    async def next_number(self) -> str:
        n = await self.session.scalar(text("SELECT nextval('application_number_seq')"))
        return f"КЗ-{today().year}-{n:06d}"

    async def offer_in_use(self, company_id: uuid.UUID, offer_id: str) -> bool:
        used = await self.session.scalar(
            select(func.count())
            .select_from(Application)
            .where(
                Application.company_id == company_id,
                Application.offer_id == offer_id,
                Application.status != ApplicationStatus.CANCELLED,
            )
        )
        return bool(used)

    async def preapproved_offer(self, ctx: ClientContext) -> dict | None:
        offers = await optional(self.external.preapproved(ctx.company.inn)) or []
        for offer in offers:
            if date.fromisoformat(offer["valid_until"]) < today():
                continue
            if await self.offer_in_use(ctx.company.id, offer["offer_id"]):
                continue
            return offer
        return None

    async def create(self, ctx: ClientContext, body: dict) -> Application:
        ctx.require("submit_applications", "Подавать заявки могут собственник, директор и сотрудники с правом подачи")
        source = body.get("source")
        purpose_code = body.get("purpose_code")
        purpose = body.get("purpose")
        collateral = None
        warning_accepted = False
        session_id = None
        offer_id = None

        if source == "preapproved":
            offers = await optional(self.external.preapproved(ctx.company.inn)) or []
            offer = next((o for o in offers if o["offer_id"] == body.get("offer_id")), None)
            if (
                offer is None
                or date.fromisoformat(offer["valid_until"]) < today()
                or await self.offer_in_use(ctx.company.id, offer["offer_id"])
            ):
                raise ApiError(410, "OFFER_EXPIRED", "Предодобренное предложение больше не действует")
            product = PRODUCTS_BY_CODE[offer["product_code"]]
            amount, term = offer["limit"]["value"], offer["term_months"]
            rate = product["rate_from_percent"]
            purpose_code = purpose_code or "working_capital"
            purpose = purpose or "Предодобренный кредит"
            offer_id = offer["offer_id"]
        elif source == "recommendation":
            try:
                session_uuid = uuid.UUID(str(body.get("matching_session_id")))
            except ValueError as e:
                raise validation("Укажите подбор", {"matching_session_id": "Обязательное поле"}) from e
            ms = await self.session.get(MatchingSession, session_uuid)
            if ms is None or ms.company_id != ctx.company.id:
                raise not_found("Подбор не найден")
            rec = ms.last_recommendation
            if not rec:
                raise invalid_transition("Сначала получите рекомендацию")
            options = [rec["primary"], *rec["alternatives"]]
            chosen = next((r for r in options if r["rank"] == (body.get("recommendation_rank") or 1)), rec["primary"])
            product = PRODUCTS_BY_CODE[chosen["product"]["code"]]
            rate = chosen["rate_percent"]
            if body.get("keep_requested"):
                amount, term = rec["requested"]["amount"]["value"], rec["requested"]["term_months"]
                warning_accepted = any(w["code"] == "LOAD_ABOVE_THRESHOLD" for w in rec["warnings"])
            else:
                amount, term = chosen["amount"]["value"], chosen["term_months"]
            purpose_code = ms.need.get("purpose") or purpose_code or "other"
            purpose = purpose or PURPOSE_TITLES.get(purpose_code, "Другая цель")
            if ms.need.get("collateral") not in (None, "none"):
                details = (ms.extra or {}).get("collateral_details") or {}
                collateral = {
                    "type": ms.need["collateral"],
                    "description": details.get("description"),
                    "estimated_value": details.get("estimated_value"),
                }
            session_id = ms.id
        elif source == "catalog":
            product = PRODUCTS_BY_CODE.get(body.get("product_code") or "")
            if product is None:
                raise validation("Выберите продукт", {"product_code": "Обязательное поле"})
            amount = (body.get("amount") or {}).get("value")
            term = body.get("term_months")
            errors = {}
            if not amount:
                errors["amount"] = "Укажите сумму"
            if not term:
                errors["term_months"] = "Укажите срок"
            if errors:
                raise validation("Укажите сумму и срок", errors)
            if ctx.company.legal_form.value not in product["legal_forms"]:
                raise validation("Продукт недоступен для вашей формы бизнеса", {"product_code": "Недоступен"})
            self.validate_terms(product, amount, term)
            rate = product["rate_from_percent"]
            purpose_code = purpose_code or product["purposes"][0]
            purpose = purpose or PURPOSE_TITLES.get(purpose_code, "Другая цель")
        else:
            raise validation("Неизвестный источник заявки", {"source": "recommendation, catalog или preapproved"})

        if purpose_code not in PURPOSE_TITLES:
            raise validation("Неизвестная цель", {"purpose_code": "Неизвестное значение"})

        app = Application(
            id=uuid.uuid4(),
            number=await self.next_number(),
            company_id=ctx.company.id,
            created_by=ctx.user.id,
            product_code=product["code"],
            purpose_code=purpose_code,
            purpose=purpose,
            currency="RUB",
            requested_amount=amount,
            requested_term_months=term,
            rate_percent=rate,
            status=ApplicationStatus.DRAFT,
            version=1,
            form_step="params",
            form_data={},
            form_saved_at=now(),
            collateral=collateral,
            client_warning_accepted=warning_accepted,
            matching_session_id=session_id,
            offer_id=offer_id,
            created_at=now(),
            updated_at=now(),
        )
        self.session.add(app)
        add_event(self.session, app, title="Заявка создана", actor=actor_of(ctx))
        audit(
            self.session,
            actor=actor_of(ctx),
            action=f"Создана заявка ({source})",
            entity="application",
            entity_id=app.id,
        )
        await self.session.flush()
        return app

    @staticmethod
    def validate_terms(product: dict, amount: int, term: int) -> None:
        errors = {}
        if not product["amount_min"] <= amount <= product["amount_max"]:
            errors["amount"] = (
                f"Сумма от {product['amount_min'] // 100:,} до {product['amount_max'] // 100:,} ₽".replace(",", " ")
            )
        if not product["term_min_months"] <= term <= product["term_max_months"]:
            errors["term_months"] = f"Срок от {product['term_min_months']} до {product['term_max_months']} мес"
        if errors:
            raise validation("Условия вне пределов продукта", errors)

    # черновик

    async def patch(self, ctx: ClientContext, app: Application, body: dict) -> None:
        await self.require_action(ctx, app, "application.edit")
        if body.get("version") != app.version:
            raise ApiError(409, "VERSION_CONFLICT", "Заявку изменил другой сотрудник. Обновите страницу")
        form = body.get("form")
        if form:
            if form.get("step"):
                app.form_step = form["step"]
            if form.get("data") is not None:
                app.form_data = {**(app.form_data or {}), **form["data"]}
                if isinstance(form["data"].get("purpose"), str) and form["data"]["purpose"].strip():
                    app.purpose = form["data"]["purpose"].strip()
            app.form_saved_at = now()
        product = PRODUCTS_BY_CODE[app.product_code]
        amount = (body.get("amount") or {}).get("value", app.requested_amount)
        term = body.get("term_months") or app.requested_term_months
        if body.get("amount") or body.get("term_months"):
            self.validate_terms(product, amount, term)
            app.requested_amount, app.requested_term_months = amount, term
        if "collateral" in body:
            app.collateral = body["collateral"]
        app.version += 1
        app.updated_at = now()

    async def requirements(self, ctx: ClientContext, app: Application) -> dict:
        return await requirements(self.session, app, self.data(ctx))

    # согласия

    async def consent_challenge(self, ctx: ClientContext, app: Application, consent_type: str) -> dict:
        await self.require_action(ctx, app, "consent.sign")
        if consent_type != "consent_bki":
            raise validation("Это согласие уже получено из Альфа-Бизнеса", {"type": "Подписывать не нужно"})
        if await self.session.scalar(
            select(Consent).where(Consent.application_id == app.id, Consent.type == consent_type)
        ):
            raise invalid_transition("Согласие уже подписано")
        return challenges.create(
            self.session, subject="consent", kind=consent_type, application_id=app.id, user_id=ctx.user.id
        )

    async def consent_confirm(self, ctx: ClientContext, app: Application, consent_type: str, body: dict) -> dict:
        await self.require_action(ctx, app, "consent.sign")
        await challenges.verify(
            self.session,
            challenge_id=body.get("challenge_id"),
            code=body.get("code", ""),
            subject="consent",
            kind=consent_type,
            application_id=app.id,
            user_id=ctx.user.id,
        )
        exists = await self.session.scalar(
            select(Consent).where(Consent.application_id == app.id, Consent.type == consent_type)
        )
        if not exists:
            self.session.add(Consent(application_id=app.id, type=consent_type, signed_by=ctx.user.id, signed_at=now()))
        audit(
            self.session,
            actor=actor_of(ctx),
            action=f"Подписано согласие {consent_type}",
            entity="application",
            entity_id=app.id,
        )
        app.updated_at = now()
        await self.session.flush()
        req = await self.requirements(ctx, app)
        return next(i for i in req["items"] if i["code"] == consent_type)

    # отправка

    async def submit(self, ctx: ClientContext, app: Application) -> None:
        await self.require_action(ctx, app, "application.submit")
        req = await self.requirements(ctx, app)
        if not req["can_submit"]:
            missing = [i["code"] for i in req["items"] if i["necessity"] == "required" and i["status"] != "done"]
            raise ApiError(422, "REQUIREMENTS_NOT_MET", "Не выполнены условия отправки", {"missing": missing})
        facts, _ = await self.data(ctx).facts()
        app.load_at_submit = requested_load_for(app, facts, await thresholds(self.session))
        app.handoff_to = None
        transition(
            self.session,
            app,
            ApplicationStatus.SUBMITTED,
            actor_of(ctx),
            notify_users=[app.created_by] if app.created_by != ctx.user.id else [],
            notification_text=f"Отправил: {ctx.user.short_name}",
        )
        await close_tasks(self.session, application_id=app.id, types=["send_application"])

    async def handoff(self, ctx: ClientContext, app: Application, member_id: str) -> dict:
        await self.require_action(ctx, app, "application.handoff")
        people = await People.load(self.session, ctx.company)
        target = next((m for m in people.members.values() if str(m.id) == str(member_id)), None)
        if target is None or target.status.value != "active" or "submit_applications" not in (target.permissions or []):
            raise validation(
                "У сотрудника нет права отправлять заявки", {"member_id": "У сотрудника нет права отправлять заявки"}
            )
        app.handoff_to = target.user_id
        app.updated_at = now()
        await close_tasks(self.session, application_id=app.id, types=["send_application"])
        task = add_task(
            self.session,
            company_id=ctx.company.id,
            type_="send_application",
            title=f"Проверить и отправить заявку {app.number} в банк",
            cta={"label": "Отправить", "route": f"/applications/{app.id}/edit"},
            assignee=target.user_id,
            application_id=app.id,
        )
        notify(
            self.session,
            [target.user_id],
            title="Вам передали заявку на отправку",
            text=f"{ctx.user.short_name} подготовил заявку {app.number}",
            application_id=app.id,
            route=f"/applications/{app.id}/edit",
        )
        audit(
            self.session,
            actor=actor_of(ctx),
            action="Передал заявку на отправку",
            entity="application",
            entity_id=app.id,
            details=people.title(target.user_id),
        )
        await self.session.flush()
        return task_view(task, ctx, people, {app.id: app})

    async def cancel(self, ctx: ClientContext, app: Application, reason: str | None) -> None:
        await self.require_action(ctx, app, "application.cancel")
        transition(self.session, app, ApplicationStatus.CANCELLED, actor_of(ctx), description=reason or None)
        await close_tasks(self.session, application_id=app.id)

    # решение банка

    async def accept_offer(self, ctx: ClientContext, app: Application) -> None:
        extras = await self.require_action(ctx, app, "offer.accept")
        if extras.offer_valid_until and date.fromisoformat(extras.offer_valid_until) < today():
            raise ApiError(410, "OFFER_EXPIRED", "Срок действия предложения банка истёк")
        transition(
            self.session,
            app,
            ApplicationStatus.SIGNING,
            actor_of(ctx),
            title="Предложение принято",
            description="Документы отправлены на подпись",
        )
        await close_tasks(self.session, application_id=app.id, types=["accept_offer"])
        await self.start_signing(ctx, app)

    async def decline_offer(self, ctx: ClientContext, app: Application, reason: str | None) -> None:
        await self.require_action(ctx, app, "offer.decline")
        transition(
            self.session,
            app,
            ApplicationStatus.CANCELLED,
            actor_of(ctx),
            title="Предложение банка отклонено",
            description=reason or None,
        )
        await close_tasks(self.session, application_id=app.id)

    # подписание

    async def start_signing(self, ctx: ClientContext, app: Application) -> None:
        """Снимок правил подписи компании; первые по порядку получают задачу сразу."""
        rules_row = await self.session.get(SigningRules, ctx.company.id)
        rules = (
            rules_row.rules
            if rules_row
            else {"signers": [{"order": 1, "document": "contract", "user_id": None, "role": "owner", "required": True}]}
        )
        people = await People.load(self.session, ctx.company)
        active = [m for m in people.members.values() if m.status.value == "active"]
        used: set[str] = set()
        signers = []
        for rule in sorted(rules["signers"], key=lambda s: s["order"]):
            user_id = rule.get("user_id")
            if user_id and uuid.UUID(user_id) not in people.members:
                user_id = None
            if not user_id and rule.get("role"):
                match = next(
                    (
                        m
                        for m in sorted(active, key=lambda m: m.created_at)
                        if m.role.value == rule["role"] and str(m.user_id) not in used
                    ),
                    None,
                )
                user_id = str(match.user_id) if match else None
            if not user_id and ctx.company.director_user_id:
                user_id = str(ctx.company.director_user_id)
            if not user_id:
                continue
            used.add(user_id)
            signers.append(
                {
                    "order": rule["order"],
                    "user_id": user_id,
                    "document": rule["document"],
                    "required": rule.get("required", True),
                    "status": "waiting",
                    "signed_at": None,
                }
            )
        if not signers:
            raise validation("В правилах подписи нет подписантов", {"signers": "Настройте правила подписи"})
        signing = SigningSession(
            application_id=app.id,
            signers=signers,
            status="active",
            rules_version=rules_row.version if rules_row else 1,
            created_at=now(),
        )
        self.session.add(signing)
        self.activate_next_signers(app, signing, people)

    def activate_next_signers(self, app: Application, signing: SigningSession, people: People) -> None:
        signers = [dict(s) for s in signing.signers]
        waiting_orders = sorted({s["order"] for s in signers if s["status"] == "waiting"})
        if not waiting_orders or any(s["status"] == "pending" for s in signers):
            return
        order = waiting_orders[0]
        for s in signers:
            if s["order"] == order:
                s["status"] = "pending"
                user_id = uuid.UUID(s["user_id"])
                add_task(
                    self.session,
                    company_id=app.company_id,
                    type_="sign",
                    title=f"Подписать {SIGN_DOC_ACCUSATIVE[s['document']]} по заявке {app.number}",
                    cta={"label": "Подписать", "route": f"/applications/{app.id}/signing"},
                    assignee=user_id,
                    application_id=app.id,
                    ref_id=s["user_id"],
                )
                notify(
                    self.session,
                    [user_id],
                    title=f"Подпишите документы по заявке {app.number}",
                    text="Код подтверждения появится в кабинете",
                    application_id=app.id,
                    route=f"/applications/{app.id}/signing",
                )
        signing.signers = signers

    async def signing_session(self, app: Application) -> SigningSession | None:
        return await self.session.scalar(select(SigningSession).where(SigningSession.application_id == app.id))

    async def signing(self, ctx: ClientContext, app: Application) -> dict:
        signing = await self.signing_session(app)
        if signing is None:
            raise not_found("Подписание ещё не началось")
        people = await People.load(self.session, ctx.company)
        return signing_state(app, signing, people, ctx.user.id)

    async def signing_challenge(self, ctx: ClientContext, app: Application) -> dict:
        await self.require_signer(ctx, app)
        return challenges.create(
            self.session, subject="signing", kind="signing", application_id=app.id, user_id=ctx.user.id
        )

    async def require_signer(self, ctx: ClientContext, app: Application) -> None:
        extras = (await load_extras(self.session, [app]))[app.id]
        if "signing.sign" not in available_actions(app, ctx, extras):
            if app.status.value != sm.SIGNING:
                raise invalid_transition("Заявка не на подписании")
            raise forbidden(
                "Сейчас подпись не от вас: документы подписывают по правилам компании", ACTION_ROLES["signing.sign"]
            )

    async def signing_confirm(self, ctx: ClientContext, app: Application, body: dict) -> dict:
        await self.require_signer(ctx, app)
        await challenges.verify(
            self.session,
            challenge_id=body.get("challenge_id"),
            code=body.get("code", ""),
            subject="signing",
            kind="signing",
            application_id=app.id,
            user_id=ctx.user.id,
        )
        signing = await self.signing_session(app)
        people = await People.load(self.session, ctx.company)
        me = str(ctx.user.id)
        signers = [dict(s) for s in signing.signers]
        signed_docs = []
        for s in signers:
            if s["user_id"] == me and s["status"] == "pending":
                s["status"] = "signed"
                s["signed_at"] = iso(now())
                signed_docs.append(s["document"])
        signing.signers = signers
        await close_tasks(self.session, application_id=app.id, types=["sign"], assignee=ctx.user.id)
        add_event(
            self.session,
            app,
            title="Документ подписан",
            actor=actor_of(ctx),
            description=f"{ctx.user.short_name}: " + ", ".join(SIGN_DOC_ACCUSATIVE[d] for d in signed_docs),
        )
        audit(
            self.session,
            actor=actor_of(ctx),
            action="Подписал документы",
            entity="application",
            entity_id=app.id,
            details=", ".join(signed_docs),
        )
        app.version += 1
        app.updated_at = now()

        required_left = [s for s in signers if s.get("required", True) and s["status"] != "signed"]
        if not required_left:
            signing.status = "completed"
            transition(
                self.session,
                app,
                ApplicationStatus.ISSUED,
                Actor("system"),
                description="Деньги зачислены на расчётный счёт",
                notify_users=people.active_ids(),
                notification_text="Деньги зачислены на расчётный счёт",
            )
            await close_tasks(self.session, application_id=app.id)
            await self.issue_loan(ctx, app)
        else:
            self.activate_next_signers(app, signing, people)
        await self.session.flush()
        return signing_state(app, signing, people, ctx.user.id)

    async def signing_remind(self, ctx: ClientContext, app: Application, user_id: str) -> None:
        await self.require_action(ctx, app, "signing.remind")
        signing = await self.signing_session(app)
        target = next((s for s in signing.signers if s["user_id"] == str(user_id) and s["status"] == "pending"), None)
        if target is None:
            raise validation("Этот сотрудник сейчас не подписывает", {"user_id": "Нет ожидающей подписи"})
        uid = uuid.UUID(target["user_id"])
        tasks = [
            t
            for t in (await load_extras(self.session, [app]))[app.id].tasks
            if t.type == "sign" and t.assignee_user_id == uid
        ]
        if not tasks:
            add_task(
                self.session,
                company_id=app.company_id,
                type_="sign",
                title=f"Подписать {SIGN_DOC_ACCUSATIVE[target['document']]} по заявке {app.number}",
                cta={"label": "Подписать", "route": f"/applications/{app.id}/signing"},
                assignee=uid,
                application_id=app.id,
                ref_id=target["user_id"],
            )
        notify(
            self.session,
            [uid],
            title=f"Напоминание: подпишите документы по заявке {app.number}",
            text=f"{ctx.user.short_name} ждёт вашу подпись",
            application_id=app.id,
            route=f"/applications/{app.id}/signing",
        )

    async def issue_loan(self, ctx: ClientContext, app: Application) -> Loan:
        """Выдача смоделирована: кредит с графиком на основной счёт."""
        amount = app.approved_amount or app.requested_amount
        term = app.approved_term_months or app.requested_term_months
        calc = payment_schedule(amount, term, float(app.rate_percent), today())
        accounts = await optional(self.external.accounts(ctx.company.inn)) or []
        primary = next((a for a in accounts if a.get("is_primary")), accounts[0] if accounts else None)
        loan = Loan(
            company_id=app.company_id,
            application_id=app.id,
            product_code=app.product_code,
            amount=amount,
            balance=amount,
            rate_percent=float(app.rate_percent),
            term_months=term,
            schedule=calc["schedule"],
            overpayment_total=calc["overpayment"]["value"],
            issued_to_account=primary["number_mask"] if primary else "40702 •••• 0000",
            source="system",
            created_at=now(),
        )
        self.session.add(loan)
        return loan

    # запросы банка

    async def info_request(self, ctx: ClientContext, app: Application, request_id: uuid.UUID) -> InfoRequest:
        request = await self.session.get(InfoRequest, request_id)
        if request is None or request.application_id != app.id:
            raise not_found("Запрос не найден")
        return request

    async def respond(self, ctx: ClientContext, app: Application, request_id: uuid.UUID, body: dict) -> dict:
        await self.require_action(ctx, app, "info_request.respond")
        request = await self.info_request(ctx, app, request_id)
        if request.status != "open":
            raise invalid_transition("На этот запрос уже ответили")
        document_ids = [str(d) for d in body.get("document_ids") or []]
        comment = (body.get("comment") or "").strip() or None
        if not document_ids and not comment:
            raise validation("Приложите документ или напишите комментарий", {"document_ids": "Приложите документ"})
        docs = []
        for doc_id in document_ids:
            try:
                doc = await self.session.get(Document, uuid.UUID(doc_id))
            except ValueError:
                doc = None
            if doc is None or doc.company_id != ctx.company.id:
                raise validation("Документ не найден", {"document_ids": f"Документ {doc_id} не найден"})
            docs.append(doc)
        for doc in docs:
            doc.application_id = doc.application_id or app.id
            doc.info_request_id = doc.info_request_id or request.id
        people = await People.load(self.session, ctx.company)
        request.status = "answered"
        request.response = {
            "comment": comment,
            "document_ids": document_ids,
            "answered_by": people.person(ctx.user.id),
            "answered_at": iso(now()),
        }
        await close_tasks(self.session, application_id=app.id, types=["info_request"], ref_id=str(request.id))
        audit(
            self.session,
            actor=actor_of(ctx),
            action="Клиент ответил на запрос",
            entity="application",
            entity_id=app.id,
            details=request.question,
        )
        await self.session.flush()
        still_open = await self.session.scalar(
            select(func.count())
            .select_from(InfoRequest)
            .where(InfoRequest.application_id == app.id, InfoRequest.status == "open")
        )
        if not still_open:
            transition(
                self.session,
                app,
                ApplicationStatus.IN_REVIEW,
                actor_of(ctx),
                title="Ответ на запрос банка",
                description="Банк продолжает рассмотрение",
                notify_users=[app.bank_assignee_id] if app.bank_assignee_id else [],
            )
            app.queued_at = now()
        return info_request_view(request)


def parse_due(value: str | None):
    return parse_dt(value)
