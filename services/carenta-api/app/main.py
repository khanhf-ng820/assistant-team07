"""CARENTA FastAPI entrypoint."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, FastAPI
from pydantic import BaseModel

from app.auth import (
    AuthConfig,
    AuthIdentity,
    TokenVerifier,
    load_auth_config,
    make_current_identity_dependency,
)
from app.errors import register_error_handlers


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: Literal["carenta-api"] = "carenta-api"


def create_app(
    auth_config: AuthConfig | None = None,
    token_verifier: TokenVerifier | None = None,
) -> FastAPI:
    application = FastAPI(title="CARENTA Financial API", version="0.1.0")
    register_error_handlers(application)

    resolved_config = auth_config or load_auth_config()
    get_current_identity = make_current_identity_dependency(
        resolved_config, verifier=token_verifier
    )

    @application.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse()

    auth_router = APIRouter()

    @auth_router.get("/auth/me", response_model=AuthIdentity)
    def auth_me(
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> AuthIdentity:
        return identity

    application.include_router(auth_router, prefix="/api/v1", tags=["auth"])
    application.include_router(auth_router, prefix="/v1", tags=["auth"])

    return application


app = create_app()
