import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import ARRAY, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, pg_enum


class UserRole(StrEnum):
    OWNER = "owner"
    DIRECTOR = "director"
    CFO_OR_ACCOUNTANT = "cfo_or_accountant"
    FINANCING_EMPLOYEE = "financing_employee"
    BANKING_EMPLOYEE = "banking_employee"
    AUTHORIZED_EMPLOYEE = "authorized_employee"


class MemberStatus(StrEnum):
    ACTIVE = "active"
    INVITED = "invited"
    PENDING_APPROVAL = "pending_approval"
    DISABLED = "disabled"


class Member(TimestampMixin, Base):
    """Сотрудник компании в кабинете: роль, права, приглашение."""

    __tablename__ = "members"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    # null, пока приглашённый не принял приглашение
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    last_name: Mapped[str] = mapped_column(String(100))
    first_name: Mapped[str] = mapped_column(String(100))
    middle_name: Mapped[str | None] = mapped_column(String(100))
    role: Mapped[UserRole] = mapped_column(pg_enum(UserRole, "user_role"))
    permissions: Mapped[list[str]] = mapped_column(ARRAY(String(32)), default=list)
    status: Mapped[MemberStatus] = mapped_column(pg_enum(MemberStatus, "member_status"), default=MemberStatus.ACTIVE)
    has_alfa_business_access: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    login: Mapped[str | None] = mapped_column(String(255))
    # код приглашения храним только хешем
    invite_code_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    invite_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class SigningRules(Base):
    """Правила подписи компании: кто подписывает и в каком порядке (К.5)."""

    __tablename__ = "signing_rules"

    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), primary_key=True)
    # {"can_send_to_signing": [...], "signers": [{order, document, user_id, role, required}]}
    rules: Mapped[dict] = mapped_column(JSONB)
    version: Mapped[int] = mapped_column(Integer, default=1)


class FinanceOverride(Base):
    """Правка клиента поверх данных из ЛК; последняя по полю главнее."""

    __tablename__ = "finance_overrides"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    field: Mapped[str] = mapped_column(String(64))
    value: Mapped[dict] = mapped_column(JSONB)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CompanyProfile(Base):
    __tablename__ = "company_profiles"

    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), primary_key=True)
    registry_confirmed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    issue_comment: Mapped[str | None] = mapped_column(Text)
    # {"external_debts": [...], "collateral_available": [...]}
    client_input: Mapped[dict] = mapped_column(JSONB, default=dict)
    completeness_percent: Mapped[int] = mapped_column(Integer, default=60)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    finance_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
