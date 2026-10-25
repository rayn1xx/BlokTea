from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

CODE_BY_STATUS = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN_ACTION",
    404: "NOT_FOUND",
    405: "BAD_REQUEST",
    409: "INVALID_TRANSITION",
    410: "OFFER_EXPIRED",
    422: "VALIDATION_ERROR",
    429: "TOO_MANY_REQUESTS",
    503: "SERVICE_UNAVAILABLE",
}


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.details = details or {}


def not_found(message: str = "Не найдено") -> ApiError:
    return ApiError(404, "NOT_FOUND", message)


def forbidden(message: str, allowed_roles: list[str] | None = None) -> ApiError:
    return ApiError(403, "FORBIDDEN_ACTION", message, {"allowed_roles": allowed_roles or []})


def invalid_transition(message: str) -> ApiError:
    return ApiError(409, "INVALID_TRANSITION", message)


def validation(message: str, details: dict[str, str] | None = None) -> ApiError:
    return ApiError(422, "VALIDATION_ERROR", message, details or {})


def error_body(code: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details or {}}}


def error_response(
    status: int, code: str, message: str, details: dict[str, Any] | None = None, headers: dict[str, str] | None = None
) -> JSONResponse:
    return JSONResponse(error_body(code, message, details), status_code=status, headers=headers)


def _field_name(loc: tuple) -> str:
    parts = [str(p) for p in loc[1:]] if len(loc) > 1 else [str(p) for p in loc]
    return ".".join(parts) or "body"


async def api_error_handler(_: Request, exc: ApiError) -> JSONResponse:
    return error_response(exc.status, exc.code, exc.message, exc.details)


async def http_error_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = CODE_BY_STATUS.get(exc.status_code, "BAD_REQUEST")
    message = exc.detail if isinstance(exc.detail, str) else "Ошибка запроса"
    return error_response(exc.status_code, code, message, headers=getattr(exc, "headers", None))


async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    details: dict[str, str] = {}
    query_error = False
    for err in exc.errors():
        loc = tuple(err.get("loc", ()))
        if loc and loc[0] in ("query", "path"):
            query_error = True
        details.setdefault(_field_name(loc), err.get("msg", "Неверное значение"))

    if query_error:
        return error_response(400, "BAD_REQUEST", "Неверные параметры запроса", details)
    return error_response(422, "VALIDATION_ERROR", "Проверьте поля", details)


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, api_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(StarletteHTTPException, http_error_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]
