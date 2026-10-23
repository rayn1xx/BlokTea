import httpx
from fastapi import APIRouter
from sqlalchemy import text

from app.api.deps import ExternalDep, SessionDep
from app.core.config import settings
from app.integrations import llm
from app.schemas.contracts import Health

router = APIRouter(tags=["health"])


async def llm_state() -> str:
    if not settings.llm_enabled:
        return "stub"
    try:
        async with httpx.AsyncClient(
            base_url=settings.ollama_base_url, timeout=2, transport=llm.client.transport, trust_env=False
        ) as client:
            response = await client.get("/api/tags")
        if response.status_code != 200:
            return "down"
        # Ollama жива, но текстовая модель ещё не скачана: все задачи уйдут в заглушки
        models = {m.get("name") for m in response.json().get("models", [])}
    except (httpx.HTTPError, ValueError):
        return "down"
    return "up" if settings.llm_model_text in models else "down"


@router.get("/health")
async def health(session: SessionDep, external: ExternalDep) -> Health:
    try:
        await session.execute(text("SELECT 1"))
        db = "ok"
    except Exception:  # noqa: BLE001 - отдаём состояние, а не 500
        db = "down"

    systems = (await external.health()).get("systems", {})
    mocks = {name: "ok" if systems.get(name) == "ok" else "down" for name in ("alfa_lk", "registry", "bki", "fns")}
    llm = await llm_state()
    degraded = db == "down" or "down" in mocks.values() or llm == "down"
    return Health(
        status="degraded" if degraded else "ok",
        db=db,
        llm=llm,
        llm_models={
            "text": settings.llm_model_text if llm != "stub" else None,
            "vision": settings.llm_model_vision if llm != "stub" else None,
        },
        mocks=mocks,
        demo_mode=settings.demo_mode,
    )
