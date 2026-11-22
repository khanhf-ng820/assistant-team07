from __future__ import annotations

import datetime as dt
from typing import Literal, Optional

from fastapi import APIRouter, FastAPI, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.repository import IdempotencyConflictError, repository
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
    opening_balance: Optional[int] = Field(default=None, ge=0)
    unpaid_commitments: Optional[int] = Field(default=None, ge=0)
    savings_reserved: Optional[int] = Field(default=None, ge=0)
    planning_days_remaining: Optional[int] = Field(default=None, gt=0)


class GoalAllocationRequest(BaseModel):
    amount: int = Field(gt=0, description="Amount in integer VND to allocate into savings")


def create_router() -> APIRouter:
    router = APIRouter()

    # --- Transactions ---

    @router.get("/transactions", response_model=TransactionListResponse)
    def list_transactions(
        start_date: Optional[dt.date] = Query(None, description="Filter transactions on or after this date"),
        end_date: Optional[dt.date] = Query(None, description="Filter transactions on or before this date"),
        kind: Optional[Literal["income", "expense"]] = Query(None, description="Filter by transaction type"),
    ) -> TransactionListResponse:
        items = repository.list_transactions(start_date=start_date, end_date=end_date, kind=kind)
        total_income = sum(t.amount for t in items if t.kind == "income")
        total_expense = sum(t.amount for t in items if t.kind == "expense")
        return TransactionListResponse(
            items=items,
            total=len(items),
            total_income=total_income,
            total_expense=total_expense,
        )

    @router.post("/transactions", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
    def create_transaction(payload: TransactionCreate) -> TransactionResponse:
        try:
            return repository.create_transaction(payload)
        except IdempotencyConflictError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))

    @router.get("/transactions/{transaction_id}", response_model=TransactionResponse)
    def get_transaction(transaction_id: str) -> TransactionResponse:
        item = repository.get_transaction(transaction_id)
        if not item:
            raise HTTPException(status_code=404, detail="Transaction not found")
        return item

    # --- Budget Summary (Safe-to-Spend & Recovery) ---

    @router.get("/budget/summary", response_model=BudgetSummaryResponse)
    def get_budget_summary(
        today: Optional[dt.date] = Query(None, description="Calculation reference date (defaults to today)"),
        days_remaining: Optional[int] = Query(None, gt=0, description="Override remaining days in planning period"),
    ) -> BudgetSummaryResponse:
        return repository.get_budget_summary(today=today, days_remaining=days_remaining)

    @router.post("/budget/config", status_code=status.HTTP_200_OK)
    def configure_budget(payload: BudgetConfigRequest) -> dict[str, str]:
        repository.configure_budget(
            opening_balance=payload.opening_balance,
            unpaid_commitments=payload.unpaid_commitments,
            savings_reserved=payload.savings_reserved,
            planning_days_remaining=payload.planning_days_remaining,
        )
        return {"status": "ok", "message": "Budget parameters updated"}

    # --- Saving Goals ---

    @router.get("/goals", response_model=list[GoalResponse])
    def list_goals(
        today: Optional[dt.date] = Query(None, description="Calculation reference date"),
    ) -> list[GoalResponse]:
        return repository.list_goals(today=today)

    @router.post("/goals", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
    def create_goal(
        payload: GoalCreate,
        today: Optional[dt.date] = Query(None, description="Calculation reference date"),
    ) -> GoalResponse:
        return repository.set_active_goal(payload, today=today)

    @router.get("/goal", response_model=GoalResponse)
    def get_active_goal(
        today: Optional[dt.date] = Query(None, description="Calculation reference date"),
    ) -> GoalResponse:
        goal = repository.get_active_goal(today=today)
        if not goal:
            raise HTTPException(status_code=404, detail="No active goal found")
        return goal

    @router.post("/goal", response_model=GoalResponse, status_code=status.HTTP_201_CREATED)
    def set_active_goal(
        payload: GoalCreate,
        today: Optional[dt.date] = Query(None, description="Calculation reference date"),
    ) -> GoalResponse:
        return repository.set_active_goal(payload, today=today)

    @router.patch("/goal", response_model=GoalResponse)
    def update_active_goal(
        payload: GoalUpdate,
        today: Optional[dt.date] = Query(None, description="Calculation reference date"),
    ) -> GoalResponse:
        goal = repository.update_active_goal(payload, today=today)
        if not goal:
            raise HTTPException(status_code=404, detail="No active goal to update")
        return goal

    @router.post("/goal/allocate", response_model=GoalResponse)
    def allocate_savings(
        payload: GoalAllocationRequest,
        today: Optional[dt.date] = Query(None, description="Calculation reference date"),
    ) -> GoalResponse:
        goal = repository.allocate_to_active_goal(payload.amount, today=today)
        if not goal:
            raise HTTPException(status_code=404, detail="No active goal to allocate savings to")
        return goal

    return router


def create_app() -> FastAPI:
    application = FastAPI(
        title="CARENTA Financial API",
        version="0.1.0",
        description="Deterministic budget calculation engine & FastAPI CRUD endpoints",
    )

    @application.get("/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse()

    # Mount v1 router at both /api/v1 and /v1 for full interoperability
    api_v1_router = create_router()
    application.include_router(api_v1_router, prefix="/api/v1", tags=["API v1"])
    application.include_router(api_v1_router, prefix="/v1", tags=["v1"])

    return application


app = create_app()
