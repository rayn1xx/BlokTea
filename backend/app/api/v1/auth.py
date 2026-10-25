from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from fastapi.responses import JSONResponse

from app.api.deps import AuthServiceDep, LoginRateLimit, SessionDep, get_password_hasher
from app.core.config import settings
from app.core.errors import error_body
from app.core.security import PasswordHasher
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.contracts import InviteAcceptRequest, InviteAcceptResponse
from app.services.auth import IssuedTokens
from app.services.exceptions import InvalidCredentialsError, InvalidRefreshTokenError
from app.services.team import accept_invite

router = APIRouter(prefix="/auth", tags=["auth"])

RefreshCookie = Annotated[str | None, Cookie(alias=settings.refresh_cookie_name)]


@router.post("/login", dependencies=[LoginRateLimit])
async def login(body: LoginRequest, response: Response, auth: AuthServiceDep) -> TokenResponse:
    try:
        issued = await auth.login(body.login, body.password)
    except InvalidCredentialsError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Неверный логин или пароль") from e

    set_refresh_cookie(response, issued)
    return token_response(issued)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(response: Response, auth: AuthServiceDep, refresh_token: RefreshCookie = None):
    try:
        issued = await auth.refresh(refresh_token)
    except InvalidRefreshTokenError:
        error = JSONResponse(error_body("UNAUTHORIZED", "Сессия закончилась, войдите снова"), status.HTTP_401_UNAUTHORIZED)
        delete_refresh_cookie(error)
        return error

    set_refresh_cookie(response, issued)
    return token_response(issued)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response, auth: AuthServiceDep, refresh_token: RefreshCookie = None) -> None:
    await auth.logout(refresh_token)
    delete_refresh_cookie(response)


@router.post("/invite/accept", dependencies=[LoginRateLimit])
async def invite_accept(
    body: InviteAcceptRequest, session: SessionDep, hasher: Annotated[PasswordHasher, Depends(get_password_hasher)]
) -> InviteAcceptResponse:
    result = await accept_invite(session, hasher, body.model_dump())
    await session.commit()
    return result


def token_response(issued: IssuedTokens) -> TokenResponse:
    return TokenResponse(access_token=issued.access_token, expires_in=issued.expires_in)


def set_refresh_cookie(response: Response, issued: IssuedTokens) -> None:
    response.set_cookie(
        settings.refresh_cookie_name,
        issued.refresh_token,
        expires=issued.refresh_expires_at,
        path=settings.refresh_cookie_path,
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite="lax",
    )


def delete_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        settings.refresh_cookie_name,
        path=settings.refresh_cookie_path,
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite="lax",
    )
