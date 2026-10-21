"""Контракт /applications с фронтом: frontend/src/models/application.ts."""

import typing
from datetime import UTC, datetime

import pytest

from app.db.repositories import ApplicationSortField
from app.models import ApplicationStatus, CreditProduct, ProductCode
from app.schemas.application import (
    ApplicationListResponse,
    ApplicationSort,
    ApplicationSummary,
    Money,
    parse_sort,
)
from tests.factories import make_application, make_company

SUMMARY_FIELDS = {
    "id",
    "number",
    "product",
    "purpose",
    "requested_amount",
    "requested_term_months",
    "approved_amount",
    "approved_term_months",
    "status",
    "required_action",
    "created_at",
    "updated_at",
}
NOW = datetime(2026, 10, 21, 12, 0, tzinfo=UTC)


def application(**overrides):
    app = make_application(company=make_company(), created_at=NOW, updated_at=NOW, **overrides)
    app.product = CreditProduct(code=app.product_code, name="Кредит на пополнение оборотных средств")
    return app


def test_fields_match_frontend_contract() -> None:
    assert set(ApplicationSummary.model_fields) == SUMMARY_FIELDS
    assert set(Money.model_fields) == {"value", "currency"}
    assert set(ApplicationListResponse.model_fields) == {"items", "page", "page_size", "total"}


def test_enums_match_frontend_contract() -> None:
    assert {s.value for s in ApplicationStatus} == {
        "draft",
        "submitted",
        "in_review",
        "info_requested",
        "approved",
        "counter_offer",
        "rejected",
        "signing",
        "issued",
        "cancelled",
    }
    assert {p.value for p in ProductCode} == {"working_capital", "investment", "overdraft", "credit_line", "express"}


def test_summary_without_decision() -> None:
    dumped = ApplicationSummary.from_model(application(requested_amount=300_000_000)).model_dump(mode="json")

    assert dumped["product"] == {"code": "working_capital", "name": "Кредит на пополнение оборотных средств"}
    assert dumped["requested_amount"] == {"value": 300_000_000, "currency": "RUB"}
    assert dumped["approved_amount"] is None
    assert dumped["approved_term_months"] is None
    assert dumped["status"] == "draft"


def test_summary_with_counter_offer() -> None:
    app = application(
        status=ApplicationStatus.COUNTER_OFFER,
        requested_amount=850_000_000,
        approved_amount=700_000_000,
        approved_term_months=36,
        currency="USD",
    )

    dumped = ApplicationSummary.from_model(app).model_dump(mode="json")

    assert dumped["requested_amount"] == {"value": 850_000_000, "currency": "USD"}
    assert dumped["approved_amount"] == {"value": 700_000_000, "currency": "USD"}
    assert dumped["approved_term_months"] == 36


@pytest.mark.parametrize(
    ("sort", "field", "descending"),
    [
        ("created_at", ApplicationSortField.CREATED_AT, False),
        ("-created_at", ApplicationSortField.CREATED_AT, True),
        ("updated_at", ApplicationSortField.UPDATED_AT, False),
        ("-updated_at", ApplicationSortField.UPDATED_AT, True),
        ("requested_amount", ApplicationSortField.REQUESTED_AMOUNT, False),
        ("-requested_amount", ApplicationSortField.REQUESTED_AMOUNT, True),
    ],
)
def test_parse_sort(sort: str, field: ApplicationSortField, descending: bool) -> None:
    assert parse_sort(sort) == (field, descending)


def test_every_sort_field_is_allowed_in_both_directions() -> None:
    allowed = set(typing.get_args(ApplicationSort))

    assert allowed == {f.value for f in ApplicationSortField} | {f"-{f.value}" for f in ApplicationSortField}
