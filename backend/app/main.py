import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.idempotency import IdempotencyMiddleware
from app.api.v1.router import api_router
from app.core.errors import install_error_handlers
from app.db.redis import redis_client
from app.db.session import engine
from app.schemas.contracts import ErrorResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    yield
    await engine.dispose()
    await redis_client.aclose()


app = FastAPI(
    title="BlokTea API",
    description="Умный кредитный кабинет: API клиента и банка. Внешние системы смоделированы, данные синтетические.",
    version="1.0.0",
    lifespan=lifespan,
    responses={
        400: {"model": ErrorResponse}, 401: {"model": ErrorResponse}, 403: {"model": ErrorResponse},
        404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}, 422: {"model": ErrorResponse},
    },
)
install_error_handlers(app)
app.add_middleware(IdempotencyMiddleware, fastapi_app=app)
app.include_router(api_router)
