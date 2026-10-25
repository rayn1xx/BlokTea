import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import ClientDep, CompanyServiceDep, SessionDep, TeamServiceDep
from app.core.config import settings
from app.schemas.contracts import (
    CompanyDetailsPatch,
    CompanyProfile,
    FinanceSummary,
    FinanceSummaryPatch,
    InviteRequest,
    InviteResponse,
    Member,
    MemberPatch,
    Onboarding,
    OnboardingCompleteRequest,
    Readiness,
    RegistryConfirmRequest,
    SigningRules,
    SigningRulesUpdate,
)

router = APIRouter(tags=["company"])


@router.get("/company/profile")
async def profile(ctx: ClientDep, service: CompanyServiceDep, session: SessionDep) -> CompanyProfile:
    result = await service.profile(ctx)
    await session.commit()
    return result


@router.post("/company/registry/confirm")
async def confirm_registry(
    body: RegistryConfirmRequest, ctx: ClientDep, service: CompanyServiceDep, session: SessionDep
) -> CompanyProfile:
    result = await service.confirm_registry(ctx, body.model_dump())
    await session.commit()
    return result


@router.patch("/company/details")
async def patch_details(
    body: CompanyDetailsPatch, ctx: ClientDep, service: CompanyServiceDep, session: SessionDep
) -> CompanyProfile:
    result = await service.patch_details(ctx, body.model_dump(exclude_unset=True, mode="json"))
    await session.commit()
    return result


@router.post("/onboarding/complete")
async def complete_onboarding(
    body: OnboardingCompleteRequest, ctx: ClientDep, service: CompanyServiceDep, session: SessionDep
) -> Onboarding:
    result = await service.complete_onboarding(ctx, body.skipped)
    await session.commit()
    return result


@router.get("/company/finance-summary")
async def finance_summary(ctx: ClientDep, service: CompanyServiceDep, session: SessionDep) -> FinanceSummary:
    result = await service.finance_summary(ctx)
    await session.commit()
    return result


@router.patch("/company/finance-summary")
async def patch_finance_summary(
    body: FinanceSummaryPatch, ctx: ClientDep, service: CompanyServiceDep, session: SessionDep
) -> FinanceSummary:
    result = await service.patch_finance(ctx, body.model_dump(exclude_unset=True, mode="json"))
    await session.commit()
    return result


@router.get("/company/readiness")
async def readiness(
    ctx: ClientDep,
    service: CompanyServiceDep,
    session: SessionDep,
    amount: Annotated[int | None, Query(ge=1, description="копейки")] = None,
    term_months: Annotated[int | None, Query(ge=1, le=360)] = None,
) -> Readiness:
    result = await service.readiness(ctx, amount, term_months, settings.rate_percent_default)
    await session.commit()
    return result


@router.get("/company/members")
async def members(ctx: ClientDep, service: TeamServiceDep) -> list[Member]:
    return await service.members(ctx)


@router.post("/company/members/invite", status_code=status.HTTP_201_CREATED)
async def invite(body: InviteRequest, ctx: ClientDep, service: TeamServiceDep, session: SessionDep) -> InviteResponse:
    result = await service.invite(ctx, body.model_dump())
    await session.commit()
    return result


@router.patch("/company/members/{member_id}")
async def patch_member(
    member_id: uuid.UUID, body: MemberPatch, ctx: ClientDep, service: TeamServiceDep, session: SessionDep
) -> Member:
    result = await service.patch(ctx, member_id, body.model_dump(exclude_unset=True))
    await session.commit()
    return result


@router.post("/company/members/{member_id}/approve")
async def approve_member(member_id: uuid.UUID, ctx: ClientDep, service: TeamServiceDep, session: SessionDep) -> Member:
    result = await service.approve(ctx, member_id)
    await session.commit()
    return result


@router.delete("/company/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_member(member_id: uuid.UUID, ctx: ClientDep, service: TeamServiceDep, session: SessionDep) -> None:
    await service.remove(ctx, member_id)
    await session.commit()


@router.get("/company/signing-rules")
async def signing_rules(ctx: ClientDep, service: TeamServiceDep, session: SessionDep) -> SigningRules:
    result = await service.signing_rules(ctx)
    await session.commit()
    return result


@router.put("/company/signing-rules")
async def put_signing_rules(
    body: SigningRulesUpdate, ctx: ClientDep, service: TeamServiceDep, session: SessionDep
) -> SigningRules:
    result = await service.put_signing_rules(ctx, body.model_dump())
    await session.commit()
    return result
