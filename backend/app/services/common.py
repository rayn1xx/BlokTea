import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import ApiError, forbidden
from app.domain.catalog import DEFAULT_PERMISSIONS, roles_with
from app.domain.finance import Thresholds
from app.models import Company, Member, MemberStatus, Setting, User

MSK = ZoneInfo("Europe/Moscow")


def now() -> datetime:
    return datetime.now(UTC)


def today() -> date:
    return now().astimezone(MSK).date()


def iso(value: datetime | date | None) -> str | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.astimezone(MSK).isoformat(timespec="seconds")
    return value.isoformat()


def parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    dt = datetime.fromisoformat(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=MSK)
    return dt


def end_of_day(d: date) -> datetime:
    return datetime(d.year, d.month, d.day, 23, 59, tzinfo=MSK)


def last_full_months(day: date) -> tuple[date, date]:
    end = day.replace(day=1) - timedelta(days=1)
    start = (date(end.year - 1, end.month, 1) + timedelta(days=32)).replace(day=1)
    return start, end


@dataclass
class ClientContext:
    user: User
    member: Member
    company: Company

    @property
    def permissions(self) -> set[str]:
        return set(self.member.permissions or [])

    def has(self, permission: str) -> bool:
        return permission in self.permissions

    def require(self, permission: str, message: str = "Действие недоступно для вашей роли") -> None:
        if not self.has(permission):
            raise forbidden(message, roles_with(permission))

    def require_role(self, roles: list[str], message: str) -> None:
        if self.member.role.value not in roles:
            raise forbidden(message, roles)


async def active_member(session: AsyncSession, user_id: uuid.UUID) -> Member | None:
    return await session.scalar(
        select(Member)
        .where(Member.user_id == user_id, Member.status == MemberStatus.ACTIVE)
        .order_by(Member.created_at)
        .limit(1)
    )


async def client_context(session: AsyncSession, user: User) -> ClientContext:
    member = await active_member(session, user.id)
    company = await session.get(Company, member.company_id) if member else None
    if member is None or company is None:
        raise ApiError(403, "NO_COMPANY_ROLE", "Нет доступа к компании. Обратитесь к собственнику бизнеса")
    return ClientContext(user=user, member=member, company=company)


def require_bank(user: User, *, admin: bool = False) -> None:
    if user.bank_role is None:
        raise forbidden("Раздел только для сотрудников банка")
    if admin and user.bank_role.value != "bank_admin":
        raise forbidden("Настройки меняет администратор банка")


def require_underwriter(user: User) -> None:
    if user.bank_role is None or user.bank_role.value != "underwriter":
        raise forbidden("Действие доступно кредитному аналитику")


def default_permissions(role: str) -> list[str]:
    return list(DEFAULT_PERMISSIONS[role])


class People:
    def __init__(self, users: dict[uuid.UUID, User], members: dict[uuid.UUID, Member], director_id: uuid.UUID | None):
        self.users = users
        self.members = members
        self.director_id = director_id

    @classmethod
    async def load(cls, session: AsyncSession, company: Company) -> "People":
        members = list(await session.scalars(select(Member).where(Member.company_id == company.id)))
        user_ids = {m.user_id for m in members if m.user_id}
        users = {u.id: u for u in await session.scalars(select(User).where(User.id.in_(user_ids)))} if user_ids else {}
        by_user = {}
        for m in sorted(members, key=lambda x: x.status != MemberStatus.ACTIVE):
            if m.user_id and m.user_id not in by_user:
                by_user[m.user_id] = m
        return cls(users, by_user, company.director_user_id)

    def person(self, user_id: uuid.UUID | None) -> dict | None:
        if user_id is None:
            return None
        user = self.users.get(user_id)
        member = self.members.get(user_id)
        name = user.short_name if user else "Сотрудник"
        return {"user_id": str(user_id), "name": name, "role": member.role.value if member else "authorized_employee"}

    def title(self, user_id: uuid.UUID) -> str:
        from app.domain.catalog import ROLE_TITLES

        p = self.person(user_id) or {"name": "Сотрудник", "role": "authorized_employee"}
        role = "директор" if user_id == self.director_id else ROLE_TITLES.get(p["role"], "сотрудник")
        return f"{p['name']} ({role})"

    def active_with(self, permission: str) -> list[uuid.UUID]:
        return [
            uid
            for uid, m in self.members.items()
            if m.status == MemberStatus.ACTIVE and permission in (m.permissions or [])
        ]

    def active_ids(self) -> list[uuid.UUID]:
        return [uid for uid, m in self.members.items() if m.status == MemberStatus.ACTIVE]


def person_of(user: User, member: Member | None) -> dict:
    return {
        "user_id": str(user.id),
        "name": user.short_name,
        "role": member.role.value if member else "authorized_employee",
    }


THRESHOLDS_KEY = "scoring_thresholds"


def default_thresholds() -> Thresholds:
    return Thresholds(
        load_threshold_percent=settings.load_threshold_percent, load_target_percent=settings.load_target_percent
    )


async def thresholds(session: AsyncSession) -> Thresholds:
    row = await session.get(Setting, THRESHOLDS_KEY)
    if row is None:
        return default_thresholds()
    return Thresholds(**row.value)


def money(value: int | None) -> dict | None:
    return None if value is None else {"value": int(value), "currency": "RUB"}
