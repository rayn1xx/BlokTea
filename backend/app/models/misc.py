"""Подбор, документы, задачи, уведомления, лента, аудит и настройки."""

import uuid
from datetime import date, datetime

from sqlalchemy import ARRAY, BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MatchingSession(Base):
    __tablename__ = "matching_sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    step: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(16), default="draft")  # draft | completed
    need: Mapped[dict] = mapped_column(JSONB)
    extra: Mapped[dict] = mapped_column(JSONB)
    finance_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    # последняя рекомендация: из неё создаётся заявка
    last_recommendation: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    application_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("applications.id", ondelete="SET NULL"), index=True
    )
    info_request_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("info_requests.id", ondelete="SET NULL"))
    document_type: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(500))
    scope: Mapped[str] = mapped_column(String(16))  # company | application
    origin: Mapped[str] = mapped_column(String(16), default="upload")  # upload | alfa_lk
    # путь строится из id документа и версии, имя файла пользователя в путь не попадает
    file_path: Mapped[str | None] = mapped_column(String(500))
    file_name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(100), default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(16), default="uploaded")
    status_reason: Mapped[str | None] = mapped_column(Text)
    expires_at: Mapped[date | None] = mapped_column(Date)
    analysis: Mapped[dict | None] = mapped_column(JSONB)
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Task(Base):
    """Задача «Требуется ваше действие»: создаётся событием, закрывается выполнением."""

    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    company_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(32))
    application_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("applications.id", ondelete="CASCADE"))
    assignee_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    # к чему относится: id запроса банка, сотрудника и т. п.
    ref_id: Mapped[str | None] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)  # open | done
    title: Mapped[str] = mapped_column(Text)
    cta: Mapped[dict] = mapped_column(JSONB)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    title: Mapped[str] = mapped_column(String(500))
    text: Mapped[str] = mapped_column(Text)
    application_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("applications.id", ondelete="SET NULL"))
    route: Mapped[str | None] = mapped_column(String(255))


class FeedItem(Base):
    """Материал ленты; кому показывать, решают правила по targeting (раздел 3.11)."""

    __tablename__ = "feed_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    type: Mapped[str] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(500))
    body: Mapped[str] = mapped_column(Text)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    tags: Mapped[list[str]] = mapped_column(ARRAY(String(64)), default=list)
    cta: Mapped[dict | None] = mapped_column(JSONB)
    # {okved_prefixes, msp_categories, legal_forms, product_code, readiness_warning, seasonality}
    targeting: Mapped[dict] = mapped_column(JSONB, default=dict)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    actor: Mapped[str] = mapped_column(String(255))
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(255))
    entity: Mapped[str] = mapped_column(String(32))
    entity_id: Mapped[str | None] = mapped_column(String(64), index=True)
    details: Mapped[str | None] = mapped_column(Text)


class Setting(Base):
    """Настройки банка, например пороги скоринга (B4)."""

    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
