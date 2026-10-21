from fastapi import APIRouter, HTTPException, status
from sqlalchemy import text

from app.api.deps import RedisDep, SessionDep

router = APIRouter(tags=["health"])


@router.get("/health")
async def health(session: SessionDep, redis: RedisDep) -> dict[str, str]:
    try:
        await session.execute(text("SELECT 1"))
    except Exception as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "database unavailable") from e

    try:
        await redis.ping()
    except Exception as e:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "redis unavailable") from e

    return {"status": "ok", "database": "ok", "redis": "ok"}
