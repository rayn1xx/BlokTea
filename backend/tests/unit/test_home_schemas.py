"""Контракт /home с фронтом: поля схем должны совпадать с frontend/src/models/*.ts."""

from datetime import UTC, datetime

from app.models import LegalForm
from app.schemas.home import AccountSummary, CompanyRead, HomeResponse
from tests.factories import make_account, make_company, make_user

# frontend/src/models/user.ts — User
USER_FIELDS = {"id", "first_name", "middle_name", "birth_date", "role", "company", "accounts"}
# frontend/src/models/company.ts — Company
COMPANY_FIELDS = {
    "id",
    "legal_form",
    "inn",
    "ogrn",
    "kpp",
    "full_name",
    "short_name",
    "registration_date",
    "okved_main",
    "okved_additional",
    "legal_address",
    "registry_status",
    "msp_category",
    "employees_count",
    "verification",
    "created_at",
    "updated_at",
}
VERIFICATION_FIELDS = {"source", "verified_at"}
# frontend/src/models/account.ts — AccountSummary
ACCOUNT_FIELDS = {"id", "owner_type", "type", "currency", "name", "is_primary", "current_money"}

NOW = datetime(2026, 10, 21, 12, 0, tzinfo=UTC)


def test_fields_match_frontend_contract() -> None:
    assert set(HomeResponse.model_fields) == USER_FIELDS
    assert set(CompanyRead.model_fields) == COMPANY_FIELDS
    assert set(CompanyRead.model_fields["verification"].annotation.model_fields) == VERIFICATION_FIELDS
    assert set(AccountSummary.model_fields) == ACCOUNT_FIELDS


def test_company_from_model_nests_verification() -> None:
    company = make_company(created_at=NOW, updated_at=NOW)

    dumped = CompanyRead.model_validate(company).model_dump(mode="json")

    assert dumped["verification"] == {"source": "egrul", "verified_at": "2026-10-01T09:00:00Z"}
    assert dumped["legal_form"] == "OOO"
    assert dumped["registry_status"] == "active"
    assert dumped["okved_additional"] == ["62.02", "63.11"]
    assert dumped["registration_date"] == "2020-01-15"


def test_individual_entrepreneur_has_no_kpp() -> None:
    company = make_company(legal_form=LegalForm.IP, created_at=NOW, updated_at=NOW)

    dumped = CompanyRead.model_validate(company).model_dump(mode="json")

    assert dumped["legal_form"] == "IP"
    assert dumped["kpp"] is None
    assert len(dumped["inn"]) == 12


def test_account_summary_from_model() -> None:
    account = make_account(user=make_user(), name=None, current_money=-500)

    dumped = AccountSummary.model_validate(account).model_dump(mode="json")

    assert dumped == {
        "id": str(account.id),
        "owner_type": "user",
        "type": "current",
        "currency": "RUB",
        "name": None,
        "is_primary": False,
        "current_money": -500,
    }


def test_home_response_without_company() -> None:
    user = make_user(role=None)

    dumped = HomeResponse(
        id=user.id,
        first_name=user.first_name,
        middle_name=None,
        birth_date=None,
        role=None,
        company=None,
        accounts=[],
    ).model_dump(mode="json")

    assert dumped["role"] is None
    assert dumped["company"] is None
    assert dumped["accounts"] == []
