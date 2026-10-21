import uuid

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Account


class AccountRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def list_for_owner(self, user_id: uuid.UUID, company_id: uuid.UUID | None) -> list[Account]:
        """Личные счета пользователя и, если передана компания, её счета."""
        owners = [Account.user_id == user_id]
        if company_id is not None:
            owners.append(Account.company_id == company_id)

        result = await self._session.scalars(
            select(Account)
            .where(or_(*owners))
            # основные счета первыми, затем счета компании, затем личные
            .order_by(Account.is_primary.desc(), Account.owner_type, Account.created_at, Account.id)
        )
        return list(result)

    async def add(self, account: Account) -> Account:
        self._session.add(account)
        await self._session.flush()
        return account
