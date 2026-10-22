"""Продукты, калькулятор, подбор, предодобренный лимит (К.7)."""

import uuid

from fastapi import APIRouter, Response, status

from app.api.deps import ClientDep, CurrentUserDep, MatchingServiceDep, SessionDep
from app.schemas.contracts import (
    LegalForm,
    MatchingSession,
    MatchingSessionPatch,
    PaymentCalcRequest,
    PaymentCalcResponse,
    PreapprovedOffer,
    Product,
    RecommendResponse,
)
from app.services import matching

router = APIRouter(tags=["products"])


@router.get("/products")
async def products(_: CurrentUserDep, legal_form: LegalForm | None = None) -> list[Product]:
    return matching.products(legal_form)


@router.get("/products/{code}")
async def product(code: str, _: CurrentUserDep) -> Product:
    return matching.product(code)


@router.post("/calculator/payment")
async def calculator(body: PaymentCalcRequest, _: CurrentUserDep) -> PaymentCalcResponse:
    return matching.calculate(body.model_dump(mode="json"))


@router.post("/matching-sessions", status_code=status.HTTP_201_CREATED)
async def create_session(ctx: ClientDep, service: MatchingServiceDep, session: SessionDep) -> MatchingSession:
    result = await service.create(ctx)
    await session.commit()
    return result


@router.get("/matching-sessions/{session_id}")
async def get_session(session_id: uuid.UUID, ctx: ClientDep, service: MatchingServiceDep) -> MatchingSession:
    return matching.session_view(await service.get(ctx, session_id))


@router.patch("/matching-sessions/{session_id}")
async def patch_session(
    session_id: uuid.UUID, body: MatchingSessionPatch, ctx: ClientDep, service: MatchingServiceDep, session: SessionDep
) -> MatchingSession:
    result = await service.patch(ctx, session_id, body.model_dump(exclude_unset=True))
    await session.commit()
    return result


@router.post("/matching-sessions/{session_id}/recommend")
async def recommend(
    session_id: uuid.UUID, ctx: ClientDep, service: MatchingServiceDep, session: SessionDep
) -> RecommendResponse:
    result = await service.recommend(ctx, session_id)
    await session.commit()
    return result


@router.get("/offers/preapproved", response_model=PreapprovedOffer, responses={204: {"description": "Предложения нет"}})
async def preapproved(ctx: ClientDep, service: MatchingServiceDep):
    offer = await service.preapproved(ctx)
    if offer is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    return offer
