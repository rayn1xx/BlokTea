import uuid
from typing import Any

from app.core.security import PasswordHasher
from app.models import User, UserRole

DEFAULT_PASSWORD = "password123"

_hasher = PasswordHasher()


def make_user(*, password: str = DEFAULT_PASSWORD, **overrides: Any) -> User:
    """Пользователь с валидными данными по умолчанию; в БД не сохраняется."""
    data: dict[str, Any] = {
        "id": uuid.uuid4(),
        "login": f"user-{uuid.uuid4().hex[:8]}@test.local",
        "first_name": "Тест",
        "middle_name": None,
        "birth_date": None,
        "role": UserRole.OWNER,
        "is_active": True,
    }
    data.update(overrides)
    return User(**data, password_hash=_hasher.hash(password))
