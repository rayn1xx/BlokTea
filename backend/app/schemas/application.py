"""GET /api/v1/applications — контракт: frontend/src/models/application.ts."""

import uuid
from datetime import datetime
from typing import Literal, Self

from pydantic import BaseModel

from app.db.repositories import ApplicationSortField
from app.models import Application, ApplicationStatus, ProductCode

# "-" перед полем — сортировка по убыванию
ApplicationSort = Literal[
    "created_at", "-created_at", "updated_at", "-updated_at", "requested_amount", "-requested_amount"
]


def parse_sort(sort: ApplicationSort) -> tuple[ApplicationSortField, bool]:
    descending = sort.startswith("-")
    return ApplicationSortField(sort.removeprefix("-")), descending


class Money(BaseModel):
    value: int  # в минимальных единицах валюты (копейках)
    currency: str  # ISO 4217


class ApplicationProduct(BaseModel):
    code: ProductCode
    name: str


class ApplicationSummary(BaseModel):
    id: uuid.UUID
    number: str
    product: ApplicationProduct
    purpose: str
    requested_amount: Money
    requested_term_months: int
    approved_amount: Money | None
    approved_term_months: int | None
    status: ApplicationStatus
    required_action: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, application: Application) -> Self:
        def money(value: int | None) -> Money | None:
            return None if value is None else Money(value=value, currency=application.currency)

        return cls(
            id=application.id,
            number=application.number,
            product=ApplicationProduct(code=application.product.code, name=application.product.name),
            purpose=application.purpose,
            requested_amount=money(application.requested_amount),
            requested_term_months=application.requested_term_months,
            approved_amount=money(application.approved_amount),
            approved_term_months=application.approved_term_months,
            status=application.status,
            required_action=application.required_action,
            created_at=application.created_at,
            updated_at=application.updated_at,
        )


class ApplicationListResponse(BaseModel):
    items: list[ApplicationSummary]
    page: int
    page_size: int
    total: int
