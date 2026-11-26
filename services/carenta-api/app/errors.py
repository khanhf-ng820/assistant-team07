"""Structured error envelope and request correlation middleware for CARENTA API."""

from __future__ import annotations

import re
from uuid import uuid4

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from starlette.exceptions import HTTPException as StarletteHTTPException

_SAFE_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._-]{1,64}$")

_STATUS_CODES: dict[int, str] = {
    status.HTTP_400_BAD_REQUEST: "BAD_REQUEST",
    status.HTTP_401_UNAUTHORIZED: "AUTH_REQUIRED",
    status.HTTP_403_FORBIDDEN: "FORBIDDEN",
    status.HTTP_404_NOT_FOUND: "NOT_FOUND",
    status.HTTP_405_METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
    status.HTTP_409_CONFLICT: "CONFLICT",
    status.HTTP_422_UNPROCESSABLE_CONTENT: "VALIDATION_ERROR",
    status.HTTP_429_TOO_MANY_REQUESTS: "RATE_LIMITED",
}


class ApiErrorDetail(BaseModel):
    code: str
    message: str
    request_id: str


class ApiErrorEnvelope(BaseModel):
    error: ApiErrorDetail


class ApiHttpError(Exception):
    """Domain HTTP error carrying a stable machine code and safe client message."""

    def __init__(self, status_code: int, code: str, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


def resolve_request_id(request: Request) -> str:
    """Return the bound request ID or derive one from a safe incoming header."""
    existing = getattr(request.state, "request_id", None)
    if isinstance(existing, str) and existing:
        return existing

    incoming = request.headers.get("X-Request-ID", "").strip()
    request_id = incoming if _SAFE_REQUEST_ID_RE.match(incoming) else uuid4().hex[:12]
    request.state.request_id = request_id
    return request_id


def _error_response(
    request: Request, status_code: int, code: str, message: str
) -> JSONResponse:
    request_id = resolve_request_id(request)
    payload = ApiErrorEnvelope(
        error=ApiErrorDetail(code=code, message=message, request_id=request_id)
    ).model_dump()
    return JSONResponse(
        status_code=status_code,
        content=payload,
        headers={"X-Request-ID": request_id},
    )


def register_error_handlers(application: FastAPI) -> None:
    """Attach request ID correlation and consistent JSON error serialization."""

    @application.middleware("http")
    async def attach_request_id(request: Request, call_next):
        request_id = resolve_request_id(request)
        response = await call_next(request)
        response.headers["X-Request-ID"] = request_id
        return response

    @application.exception_handler(ApiHttpError)
    async def handle_api_http_error(request: Request, exc: ApiHttpError) -> JSONResponse:
        return _error_response(request, exc.status_code, exc.code, exc.message)

    @application.exception_handler(StarletteHTTPException)
    async def handle_http_exception(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        code = _STATUS_CODES.get(exc.status_code, f"HTTP_{exc.status_code}")
        message = exc.detail if isinstance(exc.detail, str) and exc.detail else "Request failed."
        return _error_response(request, exc.status_code, code, message)

    @application.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        fields = [
            ".".join(str(part) for part in err.get("loc", ()) if part != "body")
            for err in exc.errors()
        ]
        cleaned = [f for f in fields if f]
        summary = (
            f"Validation error on fields: {', '.join(cleaned[:5])}."
            if cleaned
            else "Request validation failed."
        )
        return _error_response(
            request, status.HTTP_422_UNPROCESSABLE_CONTENT, "VALIDATION_ERROR", summary
        )

    @application.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, _exc: Exception) -> JSONResponse:
        return _error_response(
            request,
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            "INTERNAL_ERROR",
            "An unexpected server error occurred.",
        )
