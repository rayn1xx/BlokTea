import hashlib
import secrets
import string
import uuid
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ApiError, invalid_transition, not_found, validation
from app.core.security import PasswordHasher
from app.domain.catalog import PERMISSIONS, ROLES
from app.models import Member, MemberStatus, SigningRules, User, UserRole
from app.services.auth import normalize_login
from app.services.common import ClientContext, People, default_permissions, iso, now
from app.services.events import Actor, add_task, audit, close_tasks, notify

INVITE_TTL = timedelta(days=7)
SIGNING_DOCUMENTS = ("contract", "surety", "deal_approval")


def hash_invite(code: str) -> str:
    return hashlib.sha256(code.strip().upper().encode()).hexdigest()


def new_invite_code() -> str:
    digits = f"{1000 + secrets.randbelow(9000)}"
    letters = "".join(secrets.choice(string.ascii_uppercase) for _ in range(2))
    return f"{digits}-{letters}"


def member_view(m: Member) -> dict:
    return {
        "id": str(m.id),
        "user_id": str(m.user_id) if m.user_id else None,
        "last_name": m.last_name,
        "first_name": m.first_name,
        "middle_name": m.middle_name,
        "role": m.role.value,
        "permissions": list(m.permissions or []),
        "status": m.status.value,
        "has_alfa_business_access": m.has_alfa_business_access,
        "login": m.login,
        "created_at": iso(m.created_at),
    }


def default_signing_rules(legal_form: str, director_id: uuid.UUID | None) -> dict:
    if legal_form == "IP":
        return {
            "can_send_to_signing": ["owner"],
            "signers": [{"order": 1, "document": "contract", "user_id": None, "role": "owner", "required": True}],
        }
    return {
        "can_send_to_signing": ["owner", "director", "financing_employee"],
        "signers": [
            {
                "order": 1,
                "document": "contract",
                "user_id": str(director_id) if director_id else None,
                "role": None if director_id else "director",
                "required": True,
            },
            {"order": 2, "document": "surety", "user_id": None, "role": "owner", "required": True},
        ],
    }


def validate_permissions(permissions: list[str]) -> None:
    bad = [p for p in permissions if p not in PERMISSIONS]
    if bad:
        raise validation("Неизвестное право", {"permissions": ", ".join(bad)})


class TeamService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def actor(self, ctx: ClientContext) -> Actor:
        return Actor("client", ctx.user.id, ctx.user.short_name)

    async def members(self, ctx: ClientContext) -> list[dict]:
        rows = await self.session.scalars(
            select(Member).where(Member.company_id == ctx.company.id).order_by(Member.created_at, Member.last_name)
        )
        return [member_view(m) for m in rows]

    async def get_member(self, ctx: ClientContext, member_id: uuid.UUID) -> Member:
        member = await self.session.get(Member, member_id)
        if member is None or member.company_id != ctx.company.id:
            raise not_found("Сотрудник не найден")
        return member

    async def invite(self, ctx: ClientContext, body: dict) -> dict:
        ctx.require("manage_team", "Приглашает сотрудников собственник")
        errors = {}
        for field, message in (("last_name", "Укажите фамилию"), ("first_name", "Укажите имя")):
            if not (body.get(field) or "").strip():
                errors[field] = message
        if body.get("role") not in ROLES:
            errors["role"] = "Выберите роль"
        login = normalize_login(body.get("login_email") or "")
        if "@" not in login:
            errors["login_email"] = "Укажите почту для входа"
        if errors:
            raise validation("Проверьте поля", errors)
        if await self.session.scalar(select(User).where(User.login == login)):
            raise validation("Такой логин уже занят", {"login_email": "Сотрудник с такой почтой уже есть"})
        permissions = body.get("permissions")
        if permissions is None:
            permissions = default_permissions(body["role"])
        validate_permissions(permissions)

        code = new_invite_code()
        expires = now() + INVITE_TTL
        member = Member(
            company_id=ctx.company.id,
            user_id=None,
            last_name=body["last_name"].strip(),
            first_name=body["first_name"].strip(),
            middle_name=(body.get("middle_name") or "").strip() or None,
            role=UserRole(body["role"]),
            permissions=permissions,
            status=MemberStatus.INVITED,
            has_alfa_business_access=False,
            login=login,
            invite_code_hash=hash_invite(code),
            invite_expires_at=expires,
        )
        self.session.add(member)
        await self.session.flush()
        audit(
            self.session,
            actor=self.actor(ctx),
            action="Приглашение сотрудника",
            entity="member",
            entity_id=member.id,
            details=body["role"],
        )
        return {"member": member_view(member), "invite_code": code, "expires_at": iso(expires)}

    async def patch(self, ctx: ClientContext, member_id: uuid.UUID, body: dict) -> dict:
        ctx.require("manage_team", "Роли и права меняет собственник")
        member = await self.get_member(ctx, member_id)
        if body.get("role") is not None:
            if body["role"] not in ROLES:
                raise validation("Неизвестная роль", {"role": "Выберите роль"})
            member.role = UserRole(body["role"])
            if body.get("permissions") is None:
                member.permissions = default_permissions(body["role"])
        if body.get("permissions") is not None:
            validate_permissions(body["permissions"])
            member.permissions = body["permissions"]
        audit(
            self.session,
            actor=self.actor(ctx),
            action="Изменены роль и права",
            entity="member",
            entity_id=member.id,
            details=f"{member.role.value}: {', '.join(member.permissions)}",
        )
        return member_view(member)

    async def approve(self, ctx: ClientContext, member_id: uuid.UUID) -> dict:
        ctx.require("manage_team", "Доступ подтверждает собственник")
        member = await self.get_member(ctx, member_id)
        if member.status != MemberStatus.PENDING_APPROVAL:
            raise invalid_transition("Сотрудник не ждёт подтверждения")
        member.status = MemberStatus.ACTIVE
        member.has_alfa_business_access = True
        await close_tasks(self.session, types=["approve_member"], ref_id=str(member.id))
        notify(
            self.session,
            [member.user_id],
            title="Доступ к кабинету подтверждён",
            text=f"Вас добавили в кабинет {ctx.company.short_name}",
            route="/home",
        )
        audit(self.session, actor=self.actor(ctx), action="Доступ подтверждён", entity="member", entity_id=member.id)
        return member_view(member)

    async def remove(self, ctx: ClientContext, member_id: uuid.UUID) -> None:
        ctx.require("manage_team", "Удаляет сотрудников собственник")
        member = await self.get_member(ctx, member_id)
        if member.user_id == ctx.user.id:
            raise invalid_transition("Нельзя удалить себя")
        member.status = MemberStatus.DISABLED
        member.invite_code_hash = None
        await close_tasks(self.session, types=["approve_member"], ref_id=str(member.id))
        audit(self.session, actor=self.actor(ctx), action="Сотрудник отключён", entity="member", entity_id=member.id)

    async def signing_rules(self, ctx: ClientContext) -> dict:
        row = await self.session.get(SigningRules, ctx.company.id)
        if row is None:
            row = SigningRules(
                company_id=ctx.company.id,
                version=1,
                rules=default_signing_rules(ctx.company.legal_form.value, ctx.company.director_user_id),
            )
            self.session.add(row)
            await self.session.flush()
        return {"legal_form": ctx.company.legal_form.value, **row.rules, "version": row.version}

    async def put_signing_rules(self, ctx: ClientContext, body: dict) -> dict:
        ctx.require_role(["owner"], "Правила подписи меняет собственник")
        current = await self.signing_rules(ctx)
        if body.get("version") != current["version"]:
            raise ApiError(409, "VERSION_CONFLICT", "Правила изменил другой сотрудник. Обновите страницу")
        signers = body.get("signers") or []
        if not signers:
            raise validation("Нужен хотя бы один подписант", {"signers": "Добавьте подписанта"})
        people = await People.load(self.session, ctx.company)
        clean = []
        for i, s in enumerate(signers):
            if s.get("document") not in SIGNING_DOCUMENTS:
                raise validation(
                    "Неизвестный документ", {f"signers.{i}.document": "contract, surety или deal_approval"}
                )
            if s.get("user_id") and uuid.UUID(str(s["user_id"])) not in people.members:
                raise validation("Сотрудник не найден", {f"signers.{i}.user_id": "Нет такого сотрудника"})
            if not s.get("user_id") and s.get("role") not in ROLES:
                raise validation("Укажите сотрудника или роль", {f"signers.{i}": "Укажите сотрудника или роль"})
            clean.append(
                {
                    "order": int(s.get("order") or i + 1),
                    "document": s["document"],
                    "user_id": str(s["user_id"]) if s.get("user_id") else None,
                    "role": s.get("role"),
                    "required": bool(s.get("required", True)),
                }
            )
        can_send = [r for r in body.get("can_send_to_signing") or [] if r in ROLES]
        row = await self.session.get(SigningRules, ctx.company.id)
        row.rules = {"can_send_to_signing": can_send, "signers": clean}
        row.version += 1
        audit(
            self.session,
            actor=self.actor(ctx),
            action="Изменены правила подписи",
            entity="company",
            entity_id=ctx.company.id,
            details=f"версия {row.version}",
        )
        return {"legal_form": ctx.company.legal_form.value, **row.rules, "version": row.version}


async def accept_invite(session: AsyncSession, hasher: PasswordHasher, body: dict) -> dict:
    code = (body.get("invite_code") or "").strip().upper()
    member = await session.scalar(select(Member).where(Member.invite_code_hash == hash_invite(code))) if code else None
    if member is None or member.status != MemberStatus.INVITED:
        raise ApiError(404, "INVITE_NOT_FOUND", "Код приглашения не найден")
    if member.invite_expires_at and member.invite_expires_at < now():
        raise ApiError(410, "INVITE_EXPIRED", "Срок действия приглашения истёк")
    password = body.get("password") or ""
    if len(password) < 8:
        raise validation("Проверьте поля", {"password": "Минимум 8 символов"})

    login = normalize_login(member.login or f"{member.first_name}.{member.last_name}@invite.local")
    if await session.scalar(select(User).where(User.login == login)):
        raise validation("Логин уже занят", {"invite_code": "Приглашение уже использовано"})
    user = User(
        login=login,
        password_hash=hasher.hash(password),
        is_active=True,
        last_name=(body.get("last_name") or member.last_name).strip(),
        first_name=(body.get("first_name") or member.first_name).strip(),
        middle_name=member.middle_name,
    )
    session.add(user)
    await session.flush()
    member.user_id = user.id
    member.login = login
    member.status = MemberStatus.PENDING_APPROVAL
    member.invite_code_hash = None

    from app.models import Company

    company = await session.get(Company, member.company_id)
    people = await People.load(session, company)
    managers = people.active_with("manage_team")
    assignee = company.director_user_id if company.director_user_id in managers else (managers[0] if managers else None)
    add_task(
        session,
        company_id=company.id,
        type_="approve_member",
        title=f"Подтвердите доступ: {member.last_name} {member.first_name}",
        cta={"label": "Подтвердить", "route": "/team"},
        assignee=assignee,
        ref_id=str(member.id),
    )
    notify(
        session,
        managers,
        title="Новый сотрудник ждёт подтверждения",
        text=f"{member.last_name} {member.first_name} принял приглашение",
        route="/team",
    )
    audit(
        session,
        actor=Actor("client", user.id, user.short_name),
        action="Принял приглашение",
        entity="member",
        entity_id=member.id,
    )
    return {"status": "pending_approval", "login": login}
