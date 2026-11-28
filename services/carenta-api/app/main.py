"""CARENTA FastAPI entrypoint."""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from contextlib import asynccontextmanager
from typing import Literal, Optional

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.auth import (
    AuthConfig,
    AuthIdentity,
    TokenVerifier,
    load_auth_config,
    make_current_identity_dependency,
)
from app.errors import register_error_handlers
from app.repository import (
    ActiveGoalExistsError,
    IdempotencyConflictError,
    InMemoryRepository,
    repository as default_repository,
)
from app.schemas import (
    BudgetSummaryResponse,
    GoalCreate,
    GoalResponse,
    GoalUpdate,
    TransactionCreate,
    TransactionListResponse,
    TransactionResponse,
)
from app.settings import load_gemini_settings
from app.voice_capture import (
    UnavailableVoiceParser,
    VoiceCaptureDraft,
    VoiceCaptureRequest,
    VoiceCaptureService,
    VoiceParserProtocol,
    VoiceQuotaTracker,
    VoiceStorageHook,
)
from app.voice_gemini import GeminiVoiceParser, build_gemini_client


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: Literal["carenta-api"] = "carenta-api"


class BudgetConfigRequest(BaseModel):
    opening_balance: Optional[int] = Field(default=None, ge=0)
    unpaid_commitments: Optional[int] = Field(default=None, ge=0)
    savings_reserved: Optional[int] = Field(default=None, ge=0)


class GoalAllocationRequest(BaseModel):
    amount: int = Field(gt=0, description="Amount in integer VND to allocate into savings")


def create_router(
    get_current_identity: Callable[..., AuthIdentity],
    repo: InMemoryRepository,
    voice_service: VoiceCaptureService | None = None,
) -> APIRouter:
    router = APIRouter()
    active_voice_service = voice_service or VoiceCaptureService()

    # --- Transactions ---

    @router.get("/transactions", response_model=TransactionListResponse)
    def list_transactions(
        start_date: Optional[dt.date] = Query(None, description="Filter transactions on or after this date"),
        end_date: Optional[dt.date] = Query(None, description="Filter transactions on or before this date"),
        kind: Optional[Literal["income", "expense"]] = Query(None, description="Filter by transaction type"),
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> TransactionListResponse:
        items = repo.list_transactions(identity.user_id, start_date=start_date, end_date=end_date, kind=kind)
        total_income = sum(t.amount for t in items if t.kind == "income")
        total_expense = sum(t.amount for t in items if t.kind == "expense")
        return TransactionListResponse(
            items=items,
            total=len(items),
            total_income=total_income,
            total_expense=total_expense,
        )

    @router.post("/transactions", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
    def create_transaction(
        payload: TransactionCreate,
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> TransactionResponse:
        try:
            return repo.create_transaction(identity.user_id, payload)
        except IdempotencyConflictError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    @router.get("/transactions/{transaction_id}", response_model=TransactionResponse)
    def get_transaction(
        transaction_id: str,
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> TransactionResponse:
        item = repo.get_transaction(identity.user_id, transaction_id)
        if not item:
            raise HTTPException(status_code=404, detail="Transaction not found")
        return item

    # --- Budget Summary (Safe-to-Spend & Recovery) ---

    @router.get("/budget/summary", response_model=BudgetSummaryResponse)
    def get_budget_summary(
        today: Optional[dt.date] = Query(None, description="Calculation reference date (defaults to today)"),
        days_remaining: Optional[int] = Query(None, gt=0, description="Override remaining days in planning period"),
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> BudgetSummaryResponse:
        return repo.get_budget_summary(identity.user_id, today=today, days_remaining=days_remaining)

    @router.post("/budget/config", status_code=status.HTTP_200_OK)
    def configure_budget(
        payload: BudgetConfigRequest,
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> dict[str, str]:
        repo.configure_budget(
            identity.user_id,
            opening_balance=payload.opening_balance,
            unpaid_commitments=payload.unpaid_commitments,
            savings_reserved=payload.savings_reserved,
        )
        return {"status": "ok", "message": "Budget parameters updated"}

    # --- Saving Goals ---

    @router.get("/goals", response_model=list[GoalResponse])
    def list_goals(
        today: Optional[dt.date] = Query(None, description="Calculation reference date"),
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> list[GoalResponse]:
        return repo.list_goals(identity.user_id, today=today)

    @router.post("/goals", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
    def create_goal(
        payload: GoalCreate,
        today: Optional[dt.date] = Query(None, description="Calculation reference date"),
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> GoalResponse:
        try:
            return repo.set_active_goal(identity.user_id, payload, today=today)
        except ActiveGoalExistsError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    @router.get("/goal", response_model=GoalResponse)
    def get_active_goal(
        today: Optional[dt.date] = Query(None, description="Calculation reference date"),
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> GoalResponse:
        goal = repo.get_active_goal(identity.user_id, today=today)
        if not goal:
            raise HTTPException(status_code=404, detail="No active goal found")
        return goal

    @router.post("/goal", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
    def set_active_goal(
        payload: GoalCreate,
        today: Optional[dt.date] = Query(None, description="Calculation reference date"),
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> GoalResponse:
        try:
            return repo.set_active_goal(identity.user_id, payload, today=today)
        except ActiveGoalExistsError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    @router.patch("/goal", response_model=GoalResponse)
    def update_active_goal(
        payload: GoalUpdate,
        today: Optional[dt.date] = Query(None, description="Calculation reference date"),
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> GoalResponse:
        goal = repo.update_active_goal(identity.user_id, payload, today=today)
        if not goal:
            raise HTTPException(status_code=404, detail="No active goal to update")
        return goal

    @router.post("/goal/allocate", response_model=GoalResponse)
    def allocate_savings(
        payload: GoalAllocationRequest,
        today: Optional[dt.date] = Query(None, description="Calculation reference date"),
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> GoalResponse:
        goal = repo.allocate_to_active_goal(identity.user_id, payload.amount, today=today)
        if not goal:
            raise HTTPException(status_code=404, detail="No active goal to allocate savings to")
        return goal

    # --- Voice Capture ---

    @router.post("/capture/voice", response_model=VoiceCaptureDraft)
    async def capture_voice(
        payload: VoiceCaptureRequest,
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> VoiceCaptureDraft:
        return await active_voice_service.process_capture(
            user_id=identity.user_id,
            payload=payload,
        )

    return router


def create_app(
    auth_config: AuthConfig | None = None,
    token_verifier: TokenVerifier | None = None,
    repository: InMemoryRepository | None = None,
    voice_parser: VoiceParserProtocol | None = None,
    voice_quota_tracker: VoiceQuotaTracker | None = None,
    voice_storage_hook: VoiceStorageHook | None = None,
) -> FastAPI:
    resolved_config = auth_config or load_auth_config()
    get_current_identity = make_current_identity_dependency(
        resolved_config, verifier=token_verifier
    )
    active_repo = default_repository if repository is None else repository
    active_voice_service = VoiceCaptureService(
        parser=voice_parser,
        quota_tracker=voice_quota_tracker,
        storage_hook=voice_storage_hook,
    )

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        gemini_client = None
        if voice_parser is None:
            gemini_settings = load_gemini_settings()
            if gemini_settings is not None:
                gemini_client = build_gemini_client(gemini_settings)
                active_voice_service.set_parser(
                    GeminiVoiceParser(
                        client=gemini_client,
                        model=gemini_settings.model,
                        timeout_seconds=gemini_settings.timeout_ms / 1000.0,
                    )
                )
        try:
            yield
        finally:
            if gemini_client is not None:
                active_voice_service.set_parser(UnavailableVoiceParser())
                try:
                    await gemini_client.aio.aclose()
                finally:
                    gemini_client.close()

    application = FastAPI(
        title="CARENTA Financial API",
        version="0.1.0",
        description="Deterministic budget calculation engine & FastAPI CRUD endpoints",
        lifespan=lifespan,
    )
    register_error_handlers(application)

    @application.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse()

    auth_router = APIRouter()

    @auth_router.get("/auth/me", response_model=AuthIdentity)
    def auth_me(
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> AuthIdentity:
        return identity

    # Mount v1 routers at both /api/v1 and /v1 for full interoperability
    api_v1_router = create_router(
        get_current_identity,
        active_repo,
        voice_service=active_voice_service,
    )
    application.include_router(auth_router, prefix="/api/v1", tags=["auth"])
    application.include_router(auth_router, prefix="/v1", tags=["auth"])
    application.include_router(api_v1_router, prefix="/api/v1", tags=["API v1"])
    application.include_router(api_v1_router, prefix="/v1", tags=["v1"])

    async def capture_voice_alias(
        payload: VoiceCaptureRequest,
        identity: AuthIdentity = Depends(get_current_identity),
    ) -> VoiceCaptureDraft:
        return await active_voice_service.process_capture(
            user_id=identity.user_id,
            payload=payload,
        )

    application.add_api_route(
        "/v1/captures/voice",
        capture_voice_alias,
        methods=["POST"],
        response_model=VoiceCaptureDraft,
        tags=["v1"],
    )

    return application


app = create_app()
