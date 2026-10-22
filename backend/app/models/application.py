import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    Sequence,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, pg_enum


class ApplicationStatus(StrEnum):
    DRAFT = "draft"  # черновик, клиент ещё не отправил
    SUBMITTED = "submitted"  # отправлена, идут автопроверки
    IN_REVIEW = "in_review"  # проверка данных, скоринг, очередь аналитика
    INFO_REQUESTED = "info_requested"  # банку нужны уточнения от клиента
    APPROVED = "approved"  # одобрена на запрошенных условиях
    COUNTER_OFFER = "counter_offer"  # одобрена на иных условиях
    REJECTED = "rejected"
    SIGNING = "signing"  # клиент принял предложение, подписание документов
    ISSUED = "issued"  # кредит выдан
    CANCELLED = "cancelled"  # клиент отозвал заявку


# статусы после решения банка: только у них есть одобренные сумма и срок
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
    ANY_PURPOSE = "any_purpose"
    GOV_PROGRAM = "gov_program"


class CreditProduct(Base):
    """Справочник кодов кредитных продуктов для внешнего ключа; условия продуктов в app/domain/catalog.py."""

    __tablename__ = "credit_products"

    code: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))


# номер заявки КЗ-2026-{6 цифр}
application_number_seq = Sequence("application_number_seq", start=1044, metadata=Base.metadata)


class Application(TimestampMixin, Base):
    __tablename__ = "applications"
    __table_args__ = (
        CheckConstraint("requested_amount > 0", name="requested_amount_positive"),
        CheckConstraint("requested_term_months > 0", name="requested_term_positive"),
        CheckConstraint("approved_amount > 0", name="approved_amount_positive"),
        CheckConstraint("approved_term_months > 0", name="approved_term_positive"),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_format"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # человекочитаемый номер, например КЗ-2026-000123
    number: Mapped[str] = mapped_column(String(32), unique=True)
    # заявки: финансовая история: компанию с заявками удалить нельзя
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="RESTRICT"), index=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    product_code: Mapped[str] = mapped_column(ForeignKey("credit_products.code"))
    purpose_code: Mapped[str] = mapped_column(String(32), default="other", server_default="other")
    purpose: Mapped[str] = mapped_column(Text)

    # суммы: в минимальных единицах валюты (копейках), валюта общая для запрошенной и одобренной
    currency: Mapped[str] = mapped_column(String(3), default="RUB")
    requested_amount: Mapped[int] = mapped_column(BigInteger)
    requested_term_months: Mapped[int] = mapped_column(Integer)
    approved_amount: Mapped[int | None] = mapped_column(BigInteger)
    approved_term_months: Mapped[int | None] = mapped_column(Integer)
    rate_percent: Mapped[float] = mapped_column(Numeric(5, 2, asdecimal=False), default=15, server_default="15")

    status: Mapped[ApplicationStatus] = mapped_column(
        pg_enum(ApplicationStatus, "application_status"), default=ApplicationStatus.DRAFT, index=True
    )
    # оптимистическая блокировка: PATCH с устаревшей версией даёт 409 VERSION_CONFLICT
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")

    form_step: Mapped[str] = mapped_column(String(16), default="params", server_default="params")
    form_data: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    form_saved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    collateral: Mapped[dict | None] = mapped_column(JSONB)
    load_at_submit: Mapped[dict | None] = mapped_column(JSONB)
    # клиент оставил сумму вопреки предупреждению о нагрузке (видно аналитику)
    client_warning_accepted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    matching_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("matching_sessions.id", ondelete="SET NULL")
    )
    offer_id: Mapped[str | None] = mapped_column(String(64), index=True)
    # кому передали черновик на отправку (S14 «Передать на отправку»)
    handoff_to: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    # банковская часть
    bank_assignee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    queued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    auto_decided: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    ai_summary: Mapped[dict | None] = mapped_column(JSONB)


class ApplicationEvent(Base):
    """Событие таймлайна: переход статуса или значимое действие (подпись документа)."""

    __tablename__ = "application_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"), index=True)
    from_status: Mapped[str | None] = mapped_column(String(32))
    to_status: Mapped[str] = mapped_column(String(32))
    actor_type: Mapped[str] = mapped_column(String(16))  # client | bank | system
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    actor_name: Mapped[str | None] = mapped_column(String(255))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    payload: Mapped[dict] = mapped_column(JSONB, default=dict)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)


class Consent(Base):
    __tablename__ = "consents"
    __table_args__ = (UniqueConstraint("application_id", "type"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(32))
    signed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    signed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class InfoRequest(Base):
    __tablename__ = "info_requests"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"), index=True)
    question: Mapped[str] = mapped_column(Text)
    purpose_text: Mapped[str | None] = mapped_column(Text)
    document_types: Mapped[list[str]] = mapped_column(ARRAY(String(64)), default=list)
    lk_available: Mapped[bool] = mapped_column(Boolean, default=False)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), default="open")  # open | answered | closed
    # {comment, document_ids, answered_by: Person, answered_at}
    response: Mapped[dict | None] = mapped_column(JSONB)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Decision(Base):
    """Решение по заявке; payload: Decision из контракта К.10."""

    __tablename__ = "decisions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(16))  # approved | counter_offer | rejected
    decided_by: Mapped[str] = mapped_column(String(16))  # auto | underwriter
    decided_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    text_source: Mapped[str] = mapped_column(String(16), default="template")
    payload: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ScoringResult(Base):
    __tablename__ = "scoring_results"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"), index=True)
    total: Mapped[int] = mapped_column(Integer)
    outcome: Mapped[str] = mapped_column(String(16))
    # ScoringResult из К.14 целиком и LoadCalc, на котором он посчитан
    payload: Mapped[dict] = mapped_column(JSONB)
    load: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CheckResult(Base):
    __tablename__ = "check_results"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"), index=True)
    source: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16))
    summary: Mapped[str] = mapped_column(Text)
    details: Mapped[dict] = mapped_column(JSONB, default=dict)
    # ответы моков, на которых сделана проверка
    raw: Mapped[dict | None] = mapped_column(JSONB)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SigningSession(Base):
    """Снимок правил подписи на момент принятия предложения и статусы подписантов."""

    __tablename__ = "signing_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), unique=True
    )
    # [{order, user_id, document, required, status, signed_at}]
    signers: Mapped[list] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(16), default="active")  # active | completed
    rules_version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Challenge(Base):
    """Код подтверждения для согласия или подписи: храним только хеш."""

    __tablename__ = "challenges"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    subject: Mapped[str] = mapped_column(String(16))  # consent | signing
    kind: Mapped[str] = mapped_column(String(32))  # consent_bki | contract | ...
    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    code_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Loan(Base):
    __tablename__ = "loans"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="RESTRICT"), index=True)
    application_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("applications.id", ondelete="SET NULL"), unique=True
    )
    product_code: Mapped[str] = mapped_column(ForeignKey("credit_products.code"))
    amount: Mapped[int] = mapped_column(BigInteger)
    balance: Mapped[int] = mapped_column(BigInteger)
    rate_percent: Mapped[float] = mapped_column(Numeric(5, 2, asdecimal=False))
    term_months: Mapped[int] = mapped_column(Integer)
    schedule: Mapped[list] = mapped_column(JSONB, default=list)
    overpayment_total: Mapped[int] = mapped_column(BigInteger, default=0)
    issued_to_account: Mapped[str] = mapped_column(String(64))
    source: Mapped[str] = mapped_column(String(16), default="system")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
