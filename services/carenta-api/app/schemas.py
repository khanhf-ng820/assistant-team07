"""Pydantic schemas and contracts for CARENTA API."""

from __future__ import annotations

import datetime as dt
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class TransactionBase(BaseModel):
    amount: int = Field(gt=0, description="Transaction amount in integer VND")
    kind: Literal["income", "expense"] = Field(description="Transaction type: income or expense")
    category: str = Field(min_length=1, max_length=50, description="Spending or income category")
    date: dt.date = Field(description="Transaction date (YYYY-MM-DD)")
    note: str | None = Field(default=None, max_length=255, description="Optional note")


class TransactionCreate(TransactionBase):
    idempotency_key: str | None = Field(
        default=None,
        description="Optional unique key to prevent duplicate submissions",
    )


class TransactionResponse(TransactionBase):
    id: str = Field(description="Unique transaction ID")
    created_at: dt.datetime = Field(description="Creation timestamp")
    model_config = ConfigDict(from_attributes=True)


class TransactionListResponse(BaseModel):
    items: list[TransactionResponse]
    total: int
    total_income: int = Field(description="Total income in integer VND")
    total_expense: int = Field(description="Total expense in integer VND")


class GoalBase(BaseModel):
    title: str = Field(min_length=1, max_length=100, description="Savings goal title")
    target_amount: int = Field(gt=0, description="Target savings amount in integer VND")
    deadline: dt.date = Field(description="Goal deadline date (YYYY-MM-DD)")


class GoalCreate(GoalBase):
    initial_allocated: int = Field(
        default=0,
        ge=0,
        description="Initial amount already saved/allocated in integer VND",
    )


class GoalResponse(GoalBase):
    id: str = Field(description="Unique goal ID")
    allocated_amount: int = Field(description="Currently allocated savings in integer VND")
    remaining_target: int = Field(description="Remaining target in integer VND")
    saving_days: int = Field(description="Number of saving days left")
    suggested_daily_saving: int = Field(
        description="Deterministic suggested daily saving rate in integer VND"
    )
    is_completed: bool = Field(description="Whether the goal has been achieved")
    created_at: dt.datetime = Field(description="Creation timestamp")
    model_config = ConfigDict(from_attributes=True)


class BudgetSummaryResponse(BaseModel):
    cash: int = Field(description="Net available cash: opening balance + total income - total expenses")
    total_income: int = Field(description="Sum of all confirmed income")
    total_expense: int = Field(description="Sum of all confirmed expenses")
    unpaid_commitments: int = Field(description="Unpaid recurring or fixed commitments")
    savings_allocated: int = Field(description="Virtual savings already allocated")
    savings_reserved: int = Field(description="Savings reserved for the current period")
    protected: int = Field(description="Total protected funds (commitments + savings)")
    safe_to_spend: int = Field(description="Safe-to-Spend (Tiền còn lại, UC04) in integer VND")
    funding_shortfall: int = Field(description="Funding shortfall if commitments exceed cash")
    days_remaining: int = Field(description="Remaining days in planning period (inclusive)")
    daily_budget: int = Field(description="Initial daily allowance (Hạn mức trong ngày)")
    spent_today: int = Field(description="Total discretionary spending recorded for today")
    remaining_today: int = Field(description="Remaining allowance for today (negative if overspent)")
    is_overspent_today: bool = Field(description="True if spending today exceeded daily budget")
    overspent_amount_today: int = Field(description="Overspent amount today in integer VND")
    subsequent_daily_budget: int = Field(
        description="Dynamic recovered daily limit for subsequent days (UC05 Budget Recovery)"
    )
    is_period_exhausted: bool = Field(
        description="True if total safe-to-spend is completely depleted"
    )
    engine: str = Field(default="deterministic_zero_llm_math", description="Calculation engine")
