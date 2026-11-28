"""CARENTA FastAPI entrypoint."""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
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
from app.errors import ApiHttpError, register_error_handlers
from app.validation import MAX_AMOUNT_VND, FinancialInputError
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


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    service: Literal["carenta-api"] = "carenta-api"


class BudgetConfigRequest(BaseModel):
    opening_balance: Optional[int] = Field(default=None, ge=0, le=MAX_AMOUNT_VND, strict=True)
    unpaid_commitments: Optional[int] = Field(default=None, ge=0, le=MAX_AMOUNT_VND, strict=True)
    savings_reserved: Optional[int] = Field(default=None, ge=0, le=MAX_AMOUNT_VND, strict=True)


class GoalAllocationRequest(BaseModel):
    amount: int = Field(
        gt=0, le=MAX_AMOUNT_VND, strict=True, description="Amount in integer VND to allocate into savings"
    )


def create_router(
    get_current_identity: Callable[..., AuthIdentity],
    repo: InMemoryRepository,
) -> APIRouter:
    router = APIRouter()

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
        except FinancialInputError as exc:
            # #56: future dates, ledger overflow, and MU01 large-amount confirmation.
            raise ApiHttpError(status.HTTP_422_UNPROCESSABLE_CONTENT, exc.code, exc.message) from exc

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

    return router


def create_app(
    auth_config: AuthConfig | None = None,
    token_verifier: TokenVerifier | None = None,
    repository: InMemoryRepository | None = None,
) -> FastAPI:
    application = FastAPI(
        title="CARENTA Financial API",
        version="0.1.0",
        description="Deterministic budget calculation engine & FastAPI CRUD endpoints",
    )
    register_error_handlers(application)

    resolved_config = auth_config or load_auth_config()
    get_current_identity = make_current_identity_dependency(
        resolved_config, verifier=token_verifier
    )
    active_repo = default_repository if repository is None else repository

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
    api_v1_router = create_router(get_current_identity, active_repo)
    application.include_router(auth_router, prefix="/api/v1", tags=["auth"])
    application.include_router(auth_router, prefix="/v1", tags=["auth"])
    application.include_router(api_v1_router, prefix="/api/v1", tags=["API v1"])
    application.include_router(api_v1_router, prefix="/v1", tags=["v1"])

    return application


app = create_app()
