# все модели импортируются здесь, чтобы alembic видел их в Base.metadata
from app.db.base import Base
from app.models.account import Account, AccountOwnerType, AccountType
from app.models.application import (
    DECIDED_STATUSES,
    Application,
    ApplicationStatus,
    CreditProduct,
    ProductCode,
)
from app.models.company import Company, CompanyVerification, LegalForm, MspCategory, RegistryStatus
from app.models.user import User, UserRole

__all__ = [
    "DECIDED_STATUSES",
    "Account",
    "AccountOwnerType",
    "AccountType",
    "Application",
    "ApplicationStatus",
    "Base",
    "Company",
    "CompanyVerification",
    "CreditProduct",
    "LegalForm",
    "MspCategory",
    "ProductCode",
    "RegistryStatus",
    "User",
    "UserRole",
]
