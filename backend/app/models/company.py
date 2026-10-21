import uuid
from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import ARRAY, CheckConstraint, Date, DateTime, Integer, String, Text, text
from sqlalchemy.orm import Mapped, composite, mapped_column

from app.db.base import Base, TimestampMixin, pg_enum


class LegalForm(StrEnum):
    IP = "IP"
    OOO = "OOO"


class RegistryStatus(StrEnum):
    ACTIVE = "active"
    LIQUIDATING = "liquidating"
    LIQUIDATED = "liquidated"


class MspCategory(StrEnum):
    MICRO = "micro"
    SMALL = "small"


@dataclass
class CompanyVerification:
    """Откуда и когда подтверждены данные компании (например, выписка ЕГРЮЛ)."""

    source: str
    verified_at: datetime


class Company(TimestampMixin, Base):
    __tablename__ = "companies"
    __table_args__ = (
        CheckConstraint("inn ~ '^[0-9]{10}([0-9]{2})?$'", name="inn_format"),
        CheckConstraint("ogrn ~ '^[0-9]{13}([0-9]{2})?$'", name="ogrn_format"),
        # с 2019 года в 5–6 позициях КПП допускаются латинские буквы
        CheckConstraint("kpp ~ '^[0-9]{4}[0-9A-Z]{2}[0-9]{3}$'", name="kpp_format"),
        # ИП: ИНН 12 цифр, ОГРНИП 15, КПП нет; ООО: ИНН 10, ОГРН 13, КПП обязателен
        CheckConstraint(
            "(legal_form = 'IP' AND length(inn) = 12 AND length(ogrn) = 15 AND kpp IS NULL)"
            " OR (legal_form = 'OOO' AND length(inn) = 10 AND length(ogrn) = 13 AND kpp IS NOT NULL)",
            name="requisites_match_legal_form",
        ),
        CheckConstraint("employees_count >= 0", name="employees_count_non_negative"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    legal_form: Mapped[LegalForm] = mapped_column(pg_enum(LegalForm, "legal_form"))
    inn: Mapped[str] = mapped_column(String(12), unique=True)
    ogrn: Mapped[str] = mapped_column(String(15), unique=True)
    kpp: Mapped[str | None] = mapped_column(String(9))
    full_name: Mapped[str] = mapped_column(String(500))
    short_name: Mapped[str] = mapped_column(String(255))
    registration_date: Mapped[date] = mapped_column(Date)
    okved_main: Mapped[str] = mapped_column(String(8))
    okved_additional: Mapped[list[str]] = mapped_column(
        ARRAY(String(8)), default=list, server_default=text("'{}'")
    )
    legal_address: Mapped[str] = mapped_column(Text)
    registry_status: Mapped[RegistryStatus] = mapped_column(
        pg_enum(RegistryStatus, "registry_status"), default=RegistryStatus.ACTIVE
    )
    msp_category: Mapped[MspCategory | None] = mapped_column(pg_enum(MspCategory, "msp_category"))
    employees_count: Mapped[int | None] = mapped_column(Integer)

    verification: Mapped[CompanyVerification] = composite(
        mapped_column("verification_source", String(100)),
        mapped_column("verification_verified_at", DateTime(timezone=True)),
    )
