# все модели импортируются здесь, чтобы alembic видел их в Base.metadata
from app.db.base import Base
from app.models.user import User, UserRole

__all__ = ["Base", "User", "UserRole"]
