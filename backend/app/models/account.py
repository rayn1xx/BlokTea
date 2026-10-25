import uuid
from enum import StrEnum

from sqlalchemy import BigInteger, Boolean, CheckConstraint, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, pg_enum


class AccountOwnerType(StrEnum):
    COMPANY = "company"
    USER = "user"


class AccountType(StrEnum):
    SETTLEMENT = "settlement"
    CURRENT = "current"
    DEPOSIT = "deposit"
    CREDIT = "credit"


class Account(TimestampMixin, Base):
    __tablename__ = "accounts"
    __table_args__ = (
        CheckConstraint(
            "(owner_type = 'company' AND company_id IS NOT NULL AND user_id IS NULL)"
            " OR (owner_type = 'user' AND user_id IS NOT NULL AND company_id IS NULL)",
            name="owner_matches_type",
        ),
        CheckConstraint("currency ~ '^[A-Z]{3}$'", name="currency_format"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    owner_type: Mapped[AccountOwnerType] = mapped_column(pg_enum(AccountOwnerType, "account_owner_type"))
    company_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[AccountType] = mapped_column(pg_enum(AccountType, "account_type"))
    currency: Mapped[str] = mapped_column(String(3))
    name: Mapped[str | None] = mapped_column(String(255))
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    current_money: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
