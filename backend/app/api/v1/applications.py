"""Заявки, согласия, отправка, решение, запросы банка, подписание и кредиты (К.8, К.9, К.11)."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Query, status

from app.api.deps import (
    ApplicationServiceDep,
    ClientDep,
    CodeRateLimit,
    ExternalFactoryDep,
    FeedServiceDep,
    SessionDep,
    SessionFactoryDep,
)
from app.models import ApplicationStatus
from app.schemas.contracts import (
    ApplicationDetail,
    ApplicationPatch,
    ApplicationsListResponse,
    Challenge,
    ConfirmRequest,
    CreateApplicationRequest,
    InfoRequest,
    Loan,
    MemberIdRequest,
    ReasonRequest,
    RemindRequest,
    Requirement,
    RequirementsResponse,
    RespondRequest,
    SigningState,
    Task,
)
from app.services.application_view import info_request_view
from app.services.applications import ApplicationQuery
from app.services.review import auto_review_job

router = APIRouter(tags=["applications"])

ApplicationSort = Literal[
    "created_at", "-created_at", "updated_at", "-updated_at", "requested_amount", "-requested_amount"
]


@router.get("/applications")
async def list_applications(
    ctx: ClientDep,
    service: ApplicationServiceDep,
    # ?status=draft&status=info_requested: несколько статусов через повтор параметра
    status: Annotated[list[ApplicationStatus] | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
    sort: ApplicationSort = "-created_at",
) -> ApplicationsListResponse:
    query = ApplicationQuery(
        statuses=[s.value for s in status or []],
        page=page,
        page_size=page_size,
        sort_field=sort.removeprefix("-"),
        descending=sort.startswith("-"),
    )
    return await service.list(ctx, query)


@router.post("/applications", status_code=status.HTTP_201_CREATED)
async def create_application(
    body: CreateApplicationRequest, ctx: ClientDep, service: ApplicationServiceDep, session: SessionDep
) -> ApplicationDetail:
    app = await service.create(ctx, body.model_dump(exclude_unset=True, mode="json"))
    await session.commit()
    return await service.detail(ctx, app)


@router.get("/applications/{app_id}")
async def get_application(app_id: uuid.UUID, ctx: ClientDep, service: ApplicationServiceDep) -> ApplicationDetail:
    return await service.detail(ctx, await service.get_app(ctx, app_id))


@router.patch("/applications/{app_id}")
async def patch_application(
    app_id: uuid.UUID, body: ApplicationPatch, ctx: ClientDep, service: ApplicationServiceDep, session: SessionDep
) -> ApplicationDetail:
    app = await service.get_app(ctx, app_id, lock=True)
    await service.patch(ctx, app, body.model_dump(exclude_unset=True, mode="json"))
    await session.commit()
    return await service.detail(ctx, app)


@router.get("/applications/{app_id}/requirements")
async def application_requirements(
    app_id: uuid.UUID, ctx: ClientDep, service: ApplicationServiceDep
) -> RequirementsResponse:
    return await service.requirements(ctx, await service.get_app(ctx, app_id))


@router.post("/applications/{app_id}/consents/{consent_type}/challenge", dependencies=[CodeRateLimit])
async def consent_challenge(
    app_id: uuid.UUID,
    consent_type: Literal["consent_bki", "consent_pd"],
    ctx: ClientDep,
    service: ApplicationServiceDep,
    session: SessionDep,
) -> Challenge:
    result = await service.consent_challenge(ctx, await service.get_app(ctx, app_id), consent_type)
    await session.commit()
    return result


@router.post("/applications/{app_id}/consents/{consent_type}/confirm", dependencies=[CodeRateLimit])
async def consent_confirm(
    app_id: uuid.UUID,
    consent_type: Literal["consent_bki", "consent_pd"],
    body: ConfirmRequest,
    ctx: ClientDep,
    service: ApplicationServiceDep,
    session: SessionDep,
) -> Requirement:
    app = await service.get_app(ctx, app_id, lock=True)
    result = await service.consent_confirm(ctx, app, consent_type, body.model_dump())
    await session.commit()
    return result


@router.post("/applications/{app_id}/submit")
async def submit(
    app_id: uuid.UUID,
    ctx: ClientDep,
    service: ApplicationServiceDep,
    session: SessionDep,
    background: BackgroundTasks,
    session_factory: SessionFactoryDep,
    external_factory: ExternalFactoryDep,
) -> ApplicationDetail:
    app = await service.get_app(ctx, app_id, lock=True)
    await service.submit(ctx, app)
    await session.commit()
    # автопроверки и скоринг идут после ответа: клиент сразу видит «отправлена»
    background.add_task(auto_review_job, session_factory, external_factory, app.id)
    return await service.detail(ctx, app)


@router.post("/applications/{app_id}/handoff")
async def handoff(
    app_id: uuid.UUID, body: MemberIdRequest, ctx: ClientDep, service: ApplicationServiceDep, session: SessionDep
) -> Task:
    app = await service.get_app(ctx, app_id, lock=True)
    result = await service.handoff(ctx, app, body.member_id)
    await session.commit()
    return result


@router.post("/applications/{app_id}/cancel")
async def cancel(
    app_id: uuid.UUID,
    ctx: ClientDep,
    service: ApplicationServiceDep,
    session: SessionDep,
    body: ReasonRequest | None = None,
) -> ApplicationDetail:
    app = await service.get_app(ctx, app_id, lock=True)
    await service.cancel(ctx, app, body.reason if body else None)
    await session.commit()
    return await service.detail(ctx, app)


@router.post("/applications/{app_id}/offer/accept")
async def accept_offer(
    app_id: uuid.UUID, ctx: ClientDep, service: ApplicationServiceDep, session: SessionDep
) -> ApplicationDetail:
    app = await service.get_app(ctx, app_id, lock=True)
    await service.accept_offer(ctx, app)
    await session.commit()
    return await service.detail(ctx, app)


@router.post("/applications/{app_id}/offer/decline")
async def decline_offer(
    app_id: uuid.UUID,
    ctx: ClientDep,
    service: ApplicationServiceDep,
    session: SessionDep,
    body: ReasonRequest | None = None,
) -> ApplicationDetail:
    app = await service.get_app(ctx, app_id, lock=True)
    await service.decline_offer(ctx, app, body.reason if body else None)
    await session.commit()
    return await service.detail(ctx, app)


@router.get("/applications/{app_id}/info-requests/{request_id}")
async def get_info_request(
    app_id: uuid.UUID, request_id: uuid.UUID, ctx: ClientDep, service: ApplicationServiceDep
) -> InfoRequest:
    app = await service.get_app(ctx, app_id)
    return info_request_view(await service.info_request(ctx, app, request_id))


@router.post("/applications/{app_id}/info-requests/{request_id}/respond")
async def respond(
    app_id: uuid.UUID,
    request_id: uuid.UUID,
    body: RespondRequest,
    ctx: ClientDep,
    service: ApplicationServiceDep,
    session: SessionDep,
) -> InfoRequest:
    app = await service.get_app(ctx, app_id, lock=True)
    result = await service.respond(ctx, app, request_id, body.model_dump())
    await session.commit()
    return result


@router.get("/applications/{app_id}/signing")
async def signing(app_id: uuid.UUID, ctx: ClientDep, service: ApplicationServiceDep) -> SigningState:
    return await service.signing(ctx, await service.get_app(ctx, app_id))


@router.post("/applications/{app_id}/signing/challenge", dependencies=[CodeRateLimit])
async def signing_challenge(
    app_id: uuid.UUID, ctx: ClientDep, service: ApplicationServiceDep, session: SessionDep
) -> Challenge:
    result = await service.signing_challenge(ctx, await service.get_app(ctx, app_id))
    await session.commit()
    return result


@router.post("/applications/{app_id}/signing/confirm", dependencies=[CodeRateLimit])
async def signing_confirm(
    app_id: uuid.UUID, body: ConfirmRequest, ctx: ClientDep, service: ApplicationServiceDep, session: SessionDep
) -> SigningState:
    app = await service.get_app(ctx, app_id, lock=True)
    result = await service.signing_confirm(ctx, app, body.model_dump())
    await session.commit()
    return result


@router.post("/applications/{app_id}/signing/remind", status_code=status.HTTP_204_NO_CONTENT)
async def signing_remind(
    app_id: uuid.UUID, body: RemindRequest, ctx: ClientDep, service: ApplicationServiceDep, session: SessionDep
) -> None:
    await service.signing_remind(ctx, await service.get_app(ctx, app_id), body.user_id)
    await session.commit()


@router.get("/loans", tags=["loans"])
async def loans(ctx: ClientDep, service: FeedServiceDep) -> list[Loan]:
    return await service.loans(ctx)


@router.get("/loans/{loan_id}", tags=["loans"])
async def loan(loan_id: str, ctx: ClientDep, service: FeedServiceDep) -> Loan:
    return await service.loan(ctx, loan_id)
