from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, MetaData, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# единые имена ограничений: чтобы alembic autogenerate давал стабильные миграции
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class TimestampMixin:
    # серверные значения (now() при insert и onupdate) возвращаются через RETURNING:
    # в async-сессии ленивой догрузки атрибута после flush быть не должно
    __mapper_args__ = {"eager_defaults": True}

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


def pg_enum(enum_cls: type[StrEnum], name: str) -> SAEnum:
    # в БД храним значения ("owner"), а не имена членов enum ("OWNER"): как в API
    return SAEnum(enum_cls, name=name, values_callable=lambda e: [m.value for m in e])
