from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Account, Company, CompanyProfile, Notification, User
from app.services.common import active_member, iso
from app.services.company_data import company_view


class HomeService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_home(self, user: User) -> dict:
        member = await active_member(self.session, user.id)
        company = await self.session.get(Company, member.company_id) if member else None
        permissions = list(member.permissions or []) if member else []

        owners = [Account.user_id == user.id]
        if company:
            owners.append(Account.company_id == company.id)
        accounts = list(await self.session.scalars(select(Account).where(or_(*owners))))
        accounts.sort(key=lambda a: (not a.is_primary, a.owner_type.value != "company", a.created_at))

        profile = await self.session.get(CompanyProfile, company.id) if company else None
        is_owner = member is not None and member.role.value == "owner"
        completed = not is_owner or profile is None or profile.onboarding_completed
        next_step = None
        if not completed:
            next_step = "company_details" if profile.registry_confirmed else "registry_confirm"

        unread = await self.session.scalar(
            select(func.count())
            .select_from(Notification)
            .where(Notification.user_id == user.id, Notification.read.is_(False))
        )
        return {
            "id": str(user.id),
            "first_name": user.first_name,
            "middle_name": user.middle_name,
            "last_name": user.last_name,
            "birth_date": iso(user.birth_date),
            "role": member.role.value if member else None,
            "permissions": permissions,
            "home_profile": "entrepreneur" if "submit_applications" in permissions else "accountant",
            "bank_role": user.bank_role.value if user.bank_role else None,
            "company": await company_view(self.session, company) if company else None,
            "accounts": [
                {
                    "id": str(a.id),
                    "owner_type": a.owner_type.value,
                    "type": a.type.value,
                    "currency": a.currency,
                    "name": a.name,
                    "is_primary": a.is_primary,
                    "current_money": {"value": a.current_money, "currency": a.currency},
                }
                for a in accounts
            ],
            "onboarding": {
                "completed": completed,
                "progress_percent": profile.completeness_percent if profile else 100,
                "next_step": next_step,
            },
            "unread_notifications": unread or 0,
        }
