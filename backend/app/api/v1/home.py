from fastapi import APIRouter

from app.api.deps import CurrentUserDep, HomeServiceDep
from app.schemas.contracts import Home

router = APIRouter(tags=["home"])


@router.get("/home")
async def home(user: CurrentUserDep, service: HomeServiceDep) -> Home:
    return await service.get_home(user)
