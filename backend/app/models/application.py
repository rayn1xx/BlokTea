import uuid
from enum import StrEnum

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, pg_enum


class ApplicationStatus(StrEnum):
    DRAFT = "draft"  # черновик, клиент ещё не отправил
    SUBMITTED = "submitted"  # отправлена, ждёт приёма в работу
    IN_REVIEW = "in_review"  # проверка данных, обогащение (БКИ, ЕГРЮЛ), скоринг
    INFO_REQUESTED = "info_requested"  # банку нужны уточнения от клиента
    APPROVED = "approved"  # одобрена на запрошенных условиях
    COUNTER_OFFER = "counter_offer"  # одобрена на иных условиях
    REJECTED = "rejected"
    SIGNING = "signing"  # клиент принял предложение, подписание документов
    ISSUED = "issued"  # кредит выдан
    CANCELLED = "cancelled"  # клиент отозвал заявку


# статусы после решения банка — только у них есть одобренные сумма и срок
DECIDED_STATUSES = (
    ApplicationStatus.APPROVED,
    ApplicationStatus.COUNTER_OFFER,
    ApplicationStatus.SIGNING,
    ApplicationStatus.ISSUED,
)


class ProductCode(StrEnum):
    WORKING_CAPITAL = "working_capital"
    INVESTMENT = "investment"
    OVERDRAFT = "overdraft"
    CREDIT_LINE = "credit_line"
    EXPRESS = "express"


class CreditProduct(Base):
    """Справочник кредитных продуктов — заполняется миграцией."""

    __tablename__ = "credit_products"

    code: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))


_decided = ", ".join(f"'{s.value}'" for s in DECIDED_STATUSES)


class Application(TimestampMixin, Base):
    __tablename__ = "applications"
    __table_args__ = (
        CheckConstraint("requested_amount > 0", name="requested_amount_positive"),
        CheckConstraint("requested_term_months > 0", name="requested_term_positive"),
        CheckConstraint("approved_amount > 0", name="approved_amount_positive"),
        CheckConstraint("approved_term_months > 0", name="approved_term_positive"),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_format"),
        CheckConstraint(
            f"CASE WHEN status IN ({_decided})"
            " THEN approved_amount IS NOT NULL AND approved_term_months IS NOT NULL"
            " ELSE approved_amount IS NULL AND approved_term_months IS NULL END",
            name="approved_terms_match_status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # человекочитаемый номер, например КЗ-2026-000123
    number: Mapped[str] = mapped_column(String(32), unique=True)
    # заявки — финансовая история: компанию с заявками удалить нельзя
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="RESTRICT"), index=True)
    product_code: Mapped[str] = mapped_column(ForeignKey("credit_products.code"))
    purpose: Mapped[str] = mapped_column(Text)

    # суммы — в минимальных единицах валюты (копейках), валюта общая для запрошенной и одобренной
    currency: Mapped[str] = mapped_column(String(3), default="RUB")
    requested_amount: Mapped[int] = mapped_column(BigInteger)
    requested_term_months: Mapped[int] = mapped_column(Integer)
    approved_amount: Mapped[int | None] = mapped_column(BigInteger)
    approved_term_months: Mapped[int | None] = mapped_column(Integer)

    status: Mapped[ApplicationStatus] = mapped_column(
        pg_enum(ApplicationStatus, "application_status"), default=ApplicationStatus.DRAFT, index=True
    )
    # что нужно сделать клиенту, если от него что-то ждут
    required_action: Mapped[str | None] = mapped_column(Text)

    # lazy="raise": в async неявная подгрузка невозможна — репозиторий грузит продукт явно
    product: Mapped[CreditProduct] = relationship(lazy="raise")
