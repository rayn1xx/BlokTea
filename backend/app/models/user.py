import uuid
from datetime import date
from enum import StrEnum

from sqlalchemy import Boolean, Date, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, pg_enum


class BankRole(StrEnum):
    UNDERWRITER = "underwriter"
    BANK_ADMIN = "bank_admin"


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # логин хранится в нижнем регистре: сравнение без учёта регистра
    login: Mapped[str] = mapped_column(String(255), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")

    last_name: Mapped[str] = mapped_column(String(100), default="", server_default="")
    first_name: Mapped[str] = mapped_column(String(100))
    middle_name: Mapped[str | None] = mapped_column(String(100))
    birth_date: Mapped[date | None] = mapped_column(Date)
    # сотрудник банка; роль в компании клиента хранится в members
    bank_role: Mapped[BankRole | None] = mapped_column(pg_enum(BankRole, "bank_role"))

    @property
    def short_name(self) -> str:
        """«Смирнов П. И.»"""
        initials = f"{self.first_name[:1]}." if self.first_name else ""
        if self.middle_name:
            initials += f" {self.middle_name[:1]}."
        return f"{self.last_name} {initials}".strip()
