"""Ответ GET /api/v1/home — контракт: frontend/src/models/{user,company,account}.ts."""

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models import AccountOwnerType, AccountType, LegalForm, MspCategory, RegistryStatus, UserRole


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class VerificationRead(ORMModel):
    source: str
    verified_at: datetime


class CompanyRead(ORMModel):
    id: uuid.UUID
    legal_form: LegalForm
    inn: str
    ogrn: str
    kpp: str | None
    full_name: str
    short_name: str
    registration_date: date
    okved_main: str
    okved_additional: list[str]
    legal_address: str
    registry_status: RegistryStatus
    msp_category: MspCategory | None
    employees_count: int | None
    verification: VerificationRead
    created_at: datetime
    updated_at: datetime


class AccountSummary(ORMModel):
    id: uuid.UUID
    owner_type: AccountOwnerType
    type: AccountType
    currency: str
    name: str | None
    is_primary: bool
    current_money: int  # в копейках


class HomeResponse(BaseModel):
    id: uuid.UUID
    first_name: str
    middle_name: str | None
    birth_date: date | None
    role: UserRole | None
    company: CompanyRead | None
    accounts: list[AccountSummary]
