from fastapi import APIRouter

from app.api.deps import CurrentUserDep, HomeServiceDep
from app.schemas.home import AccountSummary, CompanyRead, HomeResponse

router = APIRouter(tags=["home"])


@router.get("/home")
async def home(user: CurrentUserDep, service: HomeServiceDep) -> HomeResponse:
    data = await service.get_home(user)

    return HomeResponse(
        id=data.user.id,
        first_name=data.user.first_name,
        middle_name=data.user.middle_name,
        birth_date=data.user.birth_date,
        role=data.user.role,
        company=CompanyRead.model_validate(data.company) if data.company else None,
        accounts=[AccountSummary.model_validate(account) for account in data.accounts],
    )
