import random
import uuid
from datetime import UTC, date, datetime
from typing import Any

from app.core.security import PasswordHasher
from app.domain.catalog import DEFAULT_PERMISSIONS
from app.models import (
    DECIDED_STATUSES,
    Account,
    AccountOwnerType,
    AccountType,
    Application,
    ApplicationStatus,
    Company,
    CompanyVerification,
    LegalForm,
    Member,
    MemberStatus,
    MspCategory,
    RegistryStatus,
    User,
    UserRole,
)

DEFAULT_PASSWORD = "password123"

_hasher = PasswordHasher()


def digits(length: int) -> str:
    return "".join(random.choices("0123456789", k=length))


def make_user(*, password: str = DEFAULT_PASSWORD, **overrides: Any) -> User:
    """Пользователь с валидными данными по умолчанию; в БД не сохраняется."""
    data: dict[str, Any] = {
        "id": uuid.uuid4(),
        "login": f"user-{uuid.uuid4().hex[:8]}@test.local",
        "last_name": "Тестов",
        "first_name": "Тест",
        "middle_name": None,
        "birth_date": None,
        "bank_role": None,
        "is_active": True,
    }
    data.update(overrides)
    return User(**data, password_hash=_hasher.hash(password))


def make_company(**overrides: Any) -> Company:
    """ООО с валидными реквизитами; для ИП передай legal_form=LegalForm.IP: реквизиты подстроятся."""
    is_ip = overrides.get("legal_form") == LegalForm.IP
    data: dict[str, Any] = {
        "id": uuid.uuid4(),
        "legal_form": LegalForm.OOO,
        "inn": digits(12 if is_ip else 10),
        "ogrn": digits(15 if is_ip else 13),
        "kpp": None if is_ip else digits(9),
        "full_name": "Общество с ограниченной ответственностью «Тест»",
        "short_name": "ООО «Тест»",
        "registration_date": date(2020, 1, 15),
        "okved_main": "62.01",
        "okved_additional": ["62.02", "63.11"],
        "legal_address": "г. Москва, ул. Тестовая, д. 1",
        "registry_status": RegistryStatus.ACTIVE,
        "msp_category": MspCategory.MICRO,
        "employees_count": 10,
        "verification": CompanyVerification(source="egrul", verified_at=datetime(2026, 10, 1, 9, 0, tzinfo=UTC)),
    }
    data.update(overrides)
    return Company(**data)


def make_member(*, company: Company, user: User | None, role: UserRole = UserRole.OWNER, **overrides: Any) -> Member:
    """Сотрудник компании; права по умолчанию для роли (К.5)."""
    data: dict[str, Any] = {
        "id": uuid.uuid4(),
        "company_id": company.id,
        "user_id": user.id if user else None,
        "last_name": user.last_name if user else "Новый",
        "first_name": user.first_name if user else "Сотрудник",
        "middle_name": None,
        "role": role,
        "permissions": list(DEFAULT_PERMISSIONS[role.value]),
        "status": MemberStatus.ACTIVE,
        "has_alfa_business_access": True,
        "login": user.login if user else None,
    }
    data.update(overrides)
    return Member(**data)


def make_account(*, company: Company | None = None, user: User | None = None, **overrides: Any) -> Account:
    """Счёт компании или пользователя: передай ровно одного владельца."""
    if (company is None) == (user is None):
        raise ValueError("нужен ровно один владелец: company или user")

    data: dict[str, Any] = {
        "id": uuid.uuid4(),
        "owner_type": AccountOwnerType.COMPANY if company else AccountOwnerType.USER,
        "company_id": company.id if company else None,
        "user_id": user.id if user else None,
        "type": AccountType.SETTLEMENT if company else AccountType.CURRENT,
        "currency": "RUB",
        "name": None,
        "is_primary": False,
        "current_money": 100_000,
    }
    data.update(overrides)
    return Account(**data)


def make_application(*, company: Company, **overrides: Any) -> Application:
    """Заявка компании; для статусов после решения банка одобренные условия = запрошенным."""
    data: dict[str, Any] = {
        "id": uuid.uuid4(),
        "number": f"КЗ-2026-{digits(6)}",
        "company_id": company.id,
        "product_code": "working_capital",
        "purpose_code": "working_capital",
        "purpose": "Пополнение оборотных средств",
        "currency": "RUB",
        "requested_amount": 100_000_000,
        "requested_term_months": 12,
        "rate_percent": 15.0,
        "status": ApplicationStatus.DRAFT,
        "version": 1,
        "form_data": {},
    }
    data.update(overrides)

    decided = data["status"] in DECIDED_STATUSES
    data.setdefault("approved_amount", data["requested_amount"] if decided else None)
    data.setdefault("approved_term_months", data["requested_term_months"] if decided else None)
    return Application(**data)
