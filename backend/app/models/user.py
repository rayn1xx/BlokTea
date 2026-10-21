import uuid
from datetime import date
from enum import StrEnum

from sqlalchemy import Boolean, Date, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, pg_enum


class UserRole(StrEnum):
    OWNER = "owner"
    DIRECTOR = "director"
    CFO = "cfo"
    ACCOUNTANT = "accountant"
    FINANCE_EMPLOYEE = "finance_employee"
    AUTHORIZED_EMPLOYEE = "authorized_employee"


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # логин хранится в нижнем регистре — сравнение без учёта регистра
    login: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    first_name: Mapped[str] = mapped_column(String(100))
    middle_name: Mapped[str | None] = mapped_column(String(100))
    birth_date: Mapped[date | None] = mapped_column(Date)
    # null — пользователь вошёл, но доступа к кабинету нет (фронт показывает «Нет доступа»)
    role: Mapped[UserRole | None] = mapped_column(pg_enum(UserRole, "user_role"))
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("companies.id", ondelete="SET NULL"), index=True
    )
