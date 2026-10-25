import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Query

from app.api.deps import BankAdminDep, BankServiceDep, BankUserDep, SessionDep, UnderwriterDep
from app.domain.catalog import INFO_REQUEST_TEMPLATES, REJECTION_REASONS
from app.models import ApplicationStatus
from app.schemas.contracts import (
    BankApplicationDetail,
    BankDashboard,
    BankDecisionRequest,
    BankQueueItem,
    CallNoteCreate,
    CounterOfferOptions,
    DecisionPreview,
    InfoRequestTemplate,
    Paginated,
    RejectionReason,
    ScoringThresholds,
)

router = APIRouter(prefix="/bank", tags=["bank"])


@router.get("/applications")
async def queue(
    user: UnderwriterDep,
    service: BankServiceDep,
    session: SessionDep,
    status: Annotated[list[ApplicationStatus] | None, Query()] = None,
    risk: Literal["high"] | None = None,
    checks: Literal["stop"] | None = None,
    mine: bool = False,
    sort: Literal["risk", "queue_time"] = "queue_time",
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 50,
) -> Paginated[BankQueueItem]:
    result = await service.queue(
        user,
        statuses=[s.value for s in status or []],
        risk=risk,
        checks=checks,
        mine=mine,
        sort=sort,
        page=page,
        page_size=page_size,
    )
    await session.commit()
    return result


@router.post("/applications/{app_id}/take")
async def take(
    app_id: uuid.UUID, user: UnderwriterDep, service: BankServiceDep, session: SessionDep
) -> BankApplicationDetail:
    app = await service.get_app(app_id, lock=True)
    await service.take(user, app)
    await session.commit()
    return await service.detail(user, app)


@router.post("/applications/{app_id}/calls", status_code=201)
async def add_call(
    app_id: uuid.UUID, body: CallNoteCreate, user: UnderwriterDep, service: BankServiceDep, session: SessionDep
) -> BankApplicationDetail:
    app = await service.get_app(app_id)
    await service.add_call(user, app, body.model_dump())
    await session.commit()
    return await service.detail(user, app)


@router.get("/applications/{app_id}")
async def application(
    app_id: uuid.UUID, user: UnderwriterDep, service: BankServiceDep, session: SessionDep
) -> BankApplicationDetail:
    result = await service.detail(user, await service.get_app(app_id))
    await session.commit()
    return result


@router.post("/applications/{app_id}/ai-summary")
async def ai_summary(
    app_id: uuid.UUID, user: UnderwriterDep, service: BankServiceDep, session: SessionDep
) -> BankApplicationDetail:
    app = await service.get_app(app_id)
    await service.ai_summary(user, app)
    await session.commit()
    return await service.detail(user, app)


@router.post("/applications/{app_id}/rerun-checks")
async def rerun_checks(
    app_id: uuid.UUID, user: UnderwriterDep, service: BankServiceDep, session: SessionDep
) -> BankApplicationDetail:
    app = await service.get_app(app_id, lock=True)
    await service.rerun_checks(user, app)
    await session.commit()
    return await service.detail(user, app)


@router.get("/applications/{app_id}/counter-offer-options")
async def counter_offer_options(app_id: uuid.UUID, _: UnderwriterDep, service: BankServiceDep) -> CounterOfferOptions:
    return await service.counter_offer_options(await service.get_app(app_id))


@router.post("/applications/{app_id}/decision/preview")
async def decision_preview(
    app_id: uuid.UUID, body: BankDecisionRequest, _: UnderwriterDep, service: BankServiceDep
) -> DecisionPreview:
    return await service.preview(await service.get_app(app_id), body.model_dump(mode="json"))


@router.post("/applications/{app_id}/decision")
async def decision(
    app_id: uuid.UUID, body: BankDecisionRequest, user: UnderwriterDep, service: BankServiceDep, session: SessionDep
) -> BankApplicationDetail:
    app = await service.get_app(app_id, lock=True)
    await service.decide(user, app, body.model_dump(mode="json"))
    await session.commit()
    return await service.detail(user, app)


@router.get("/info-request-templates")
async def info_request_templates(_: UnderwriterDep) -> list[InfoRequestTemplate]:
    return INFO_REQUEST_TEMPLATES


@router.get("/rejection-reasons")
async def rejection_reasons(_: UnderwriterDep) -> list[RejectionReason]:
    return REJECTION_REASONS


@router.get("/dashboard")
async def dashboard(_: BankUserDep, service: BankServiceDep, period: Literal["7d", "30d"] = "7d") -> BankDashboard:
    return await service.dashboard(period)


@router.get("/settings/scoring")
async def scoring_settings(_: BankUserDep, service: BankServiceDep) -> ScoringThresholds:
    return await service.scoring_settings()


@router.put("/settings/scoring")
async def put_scoring_settings(
    body: ScoringThresholds, user: BankAdminDep, service: BankServiceDep, session: SessionDep
) -> ScoringThresholds:
    result = await service.put_scoring_settings(user, body.model_dump())
    await session.commit()
    return result
