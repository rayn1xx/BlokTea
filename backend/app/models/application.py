import uuid
from datetime import date, datetime
from enum import StrEnum

from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    CheckConstraint,
    Date,
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
    DRAFT = "draft"
    SUBMITTED = "submitted"
    IN_REVIEW = "in_review"
    INFO_REQUESTED = "info_requested"
    APPROVED = "approved"
    COUNTER_OFFER = "counter_offer"
    REJECTED = "rejected"
    SIGNING = "signing"
    ISSUED = "issued"
    CANCELLED = "cancelled"


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
    __tablename__ = "credit_products"

    code: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))


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
    number: Mapped[str] = mapped_column(String(32), unique=True)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="RESTRICT"), index=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    product_code: Mapped[str] = mapped_column(ForeignKey("credit_products.code"))
    purpose_code: Mapped[str] = mapped_column(String(32), default="other", server_default="other")
    purpose: Mapped[str] = mapped_column(Text)

    currency: Mapped[str] = mapped_column(String(3), default="RUB")
    requested_amount: Mapped[int] = mapped_column(BigInteger)
    requested_term_months: Mapped[int] = mapped_column(Integer)
    approved_amount: Mapped[int | None] = mapped_column(BigInteger)
    approved_term_months: Mapped[int | None] = mapped_column(Integer)
    rate_percent: Mapped[float] = mapped_column(Numeric(5, 2, asdecimal=False), default=15, server_default="15")

    status: Mapped[ApplicationStatus] = mapped_column(
        pg_enum(ApplicationStatus, "application_status"), default=ApplicationStatus.DRAFT, index=True
    )
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")

    form_step: Mapped[str] = mapped_column(String(16), default="params", server_default="params")
    form_data: Mapped[dict] = mapped_column(JSONB, default=dict, server_default="{}")
    form_saved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    collateral: Mapped[dict | None] = mapped_column(JSONB)
    load_at_submit: Mapped[dict | None] = mapped_column(JSONB)
    client_warning_accepted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    matching_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("matching_sessions.id", ondelete="SET NULL")
    )
    offer_id: Mapped[str | None] = mapped_column(String(64), index=True)
    handoff_to: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    bank_assignee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    queued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    auto_decided: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    ai_summary: Mapped[dict | None] = mapped_column(JSONB)


class ApplicationEvent(Base):
    __tablename__ = "application_events"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"), index=True)
    from_status: Mapped[str | None] = mapped_column(String(32))
    to_status: Mapped[str] = mapped_column(String(32))
    actor_type: Mapped[str] = mapped_column(String(16))
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
    status: Mapped[str] = mapped_column(String(16), default="open")
    response: Mapped[dict | None] = mapped_column(JSONB)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class CallNote(Base):
    __tablename__ = "call_notes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"), index=True)
    stage: Mapped[str] = mapped_column(String(32))
    called_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    duration_minutes: Mapped[int | None] = mapped_column(Integer)
    topic: Mapped[str] = mapped_column(String(255))
    summary: Mapped[str] = mapped_column(Text)
    agreements: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list)
    next_step: Mapped[str | None] = mapped_column(Text)
    next_step_due: Mapped[date | None] = mapped_column(Date)
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    author_name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Decision(Base):
    __tablename__ = "decisions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(16))
    decided_by: Mapped[str] = mapped_column(String(16))
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
    raw: Mapped[dict | None] = mapped_column(JSONB)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SigningSession(Base):
    __tablename__ = "signing_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    application_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("applications.id", ondelete="CASCADE"), unique=True
    )
    signers: Mapped[list] = mapped_column(JSONB)
    status: Mapped[str] = mapped_column(String(16), default="active")
    rules_version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Challenge(Base):
    __tablename__ = "challenges"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    subject: Mapped[str] = mapped_column(String(16))
    kind: Mapped[str] = mapped_column(String(32))
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
