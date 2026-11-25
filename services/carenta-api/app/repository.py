"""In-memory data repository for CARENTA API.

Architecture Note:
    Phase 1 single in-memory store baseline. User authentication, RLS, and multi-tenancy
    are mocked / single-tenant until Supabase integration in subsequent phase (Issue #42 / #46).
    Enforces idempotency keys, deterministic queries, and calculation consistency.
"""

from __future__ import annotations

import datetime as dt
import threading
import uuid
from typing import Optional

from app.budget import (
    calculate_budget_recovery,
    calculate_goal_projection,
    calculate_safe_to_spend,
)
from app.schemas import (
    BudgetSummaryResponse,
    GoalCreate,
    GoalResponse,
    GoalUpdate,
    TransactionCreate,
    TransactionResponse,
)

# Standard timezone for CARENTA (Asia/Ho_Chi_Minh, UTC+7)
LOCAL_TZ = dt.timezone(dt.timedelta(hours=7))


def get_current_date() -> dt.date:
    """Return the current local calendar date in Asia/Ho_Chi_Minh."""
    return dt.datetime.now(LOCAL_TZ).date()


def calculate_days_remaining_to_month_end(ref_date: dt.date) -> int:
    """Derive remaining days inclusively from ref_date to the end of the month."""
    year = ref_date.year
    month = ref_date.month
    if month == 12:
        next_month = dt.date(year + 1, 1, 1)
    else:
        next_month = dt.date(year, month + 1, 1)
    last_day_of_month = next_month - dt.timedelta(days=1)
    return max(1, (last_day_of_month - ref_date).days + 1)


class IdempotencyConflictError(Exception):
    """Raised when an idempotency key is reused with a different payload."""
    pass


class ActiveGoalExistsError(Exception):
    """Raised when creating a goal while one is already active."""
    pass


class InMemoryRepository:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._transactions: dict[str, dict] = {}
        self._idempotency_map: dict[str, str] = {}  # idempotency_key -> transaction_id
        self._goals: dict[str, dict] = {}
        self._active_goal_id: Optional[str] = None

        # User budget configuration baseline (defaults for planning)
        self._opening_balance: int = 0
        self._unpaid_commitments: int = 0
        self._savings_reserved: int = 0

    def reset(self) -> None:
        """Clear all stored data (useful for test isolation)."""
        with self._lock:
            self._transactions.clear()
            self._idempotency_map.clear()
            self._goals.clear()
            self._active_goal_id = None
            self._opening_balance = 0
            self._unpaid_commitments = 0
            self._savings_reserved = 0

    def configure_budget(
        self,
        opening_balance: int | None = None,
        unpaid_commitments: int | None = None,
        savings_reserved: int | None = None,
    ) -> None:
        with self._lock:
            if opening_balance is not None:
                self._opening_balance = opening_balance
            if unpaid_commitments is not None:
                self._unpaid_commitments = unpaid_commitments
            if savings_reserved is not None:
                self._savings_reserved = savings_reserved

    # --- Transactions ---

    def create_transaction(self, data: TransactionCreate) -> TransactionResponse:
        with self._lock:
            # Check idempotency
            if data.idempotency_key in self._idempotency_map:
                existing_id = self._idempotency_map[data.idempotency_key]
                record = self._transactions[existing_id]
                # Plan §9: A retry with mismatched payload must return a conflict
                if (
                    record["amount"] != data.amount
                    or record["kind"] != data.kind
                    or record["category"] != data.category
                    or record["date"] != data.date
                    or record["note"] != data.note
                ):
                    raise IdempotencyConflictError(
                        "Idempotency key conflict: payload does not match the original transaction"
                    )
                return TransactionResponse(**record)

            tx_id = str(uuid.uuid4())
            now = dt.datetime.now(dt.timezone.utc)
            record = {
                "id": tx_id,
                "amount": data.amount,
                "kind": data.kind,
                "category": data.category,
                "date": data.date,
                "note": data.note,
                "idempotency_key": data.idempotency_key,
                "created_at": now,
            }
            self._transactions[tx_id] = record
            self._idempotency_map[data.idempotency_key] = tx_id

            return TransactionResponse(**record)

    def list_transactions(
        self,
        start_date: Optional[dt.date] = None,
        end_date: Optional[dt.date] = None,
        kind: Optional[str] = None,
    ) -> list[TransactionResponse]:
        with self._lock:
            items = list(self._transactions.values())

        if start_date:
            items = [item for item in items if item["date"] >= start_date]
        if end_date:
            items = [item for item in items if item["date"] <= end_date]
        if kind:
            items = [item for item in items if item["kind"] == kind]

        # Sort descending by date, then created_at
        items.sort(key=lambda x: (x["date"], x["created_at"]), reverse=True)
        return [TransactionResponse(**item) for item in items]

    def get_transaction(self, tx_id: str) -> Optional[TransactionResponse]:
        with self._lock:
            record = self._transactions.get(tx_id)
            if record:
                return TransactionResponse(**record)
            return None

    # --- Goals ---

    def set_active_goal(self, data: GoalCreate, today: Optional[dt.date] = None) -> GoalResponse:
        """Create the single active goal. Rejects client-supplied balance overrides.

        Raises ActiveGoalExistsError if a goal is already active, so money already
        allocated to it can never silently become spendable. Use update_active_goal.
        """
        current_date = today or get_current_date()
        with self._lock:
            if self._active_goal_id and self._active_goal_id in self._goals:
                raise ActiveGoalExistsError(
                    "An active goal already exists; update it with PATCH /goal instead"
                )
            goal_id = str(uuid.uuid4())
            now = dt.datetime.now(dt.timezone.utc)
            record = {
                "id": goal_id,
                "title": data.title,
                "target_amount": data.target_amount,
                "deadline": data.deadline,
                "allocated_amount": 0,  # Starts strictly at 0 (reject client overrides)
                "created_at": now,
            }
            self._goals[goal_id] = record
            self._active_goal_id = goal_id

        return self._format_goal(record, current_date)

    def update_active_goal(self, data: GoalUpdate, today: Optional[dt.date] = None) -> Optional[GoalResponse]:
        """Update existing active goal while strictly preserving allocated savings."""
        current_date = today or get_current_date()
        with self._lock:
            if not self._active_goal_id or self._active_goal_id not in self._goals:
                return None
            record = self._goals[self._active_goal_id]
            if data.title is not None:
                record["title"] = data.title
            if data.target_amount is not None:
                record["target_amount"] = data.target_amount
            if data.deadline is not None:
                record["deadline"] = data.deadline

        return self._format_goal(record, current_date)

    def allocate_to_active_goal(self, amount: int, today: Optional[dt.date] = None) -> Optional[GoalResponse]:
        """Allocate virtual savings to the active goal.

        Plan §7: allocation moves value from the period's still-reserved savings into
        allocated savings. Only the part above the reserve reduces discretionary funds.
        """
        current_date = today or get_current_date()
        with self._lock:
            if not self._active_goal_id or self._active_goal_id not in self._goals:
                return None
            record = self._goals[self._active_goal_id]
            record["allocated_amount"] += amount
            self._savings_reserved -= min(amount, self._savings_reserved)

        return self._format_goal(record, current_date)

    def get_active_goal(self, today: Optional[dt.date] = None) -> Optional[GoalResponse]:
        current_date = today or get_current_date()
        with self._lock:
            if not self._active_goal_id or self._active_goal_id not in self._goals:
                return None
            record = self._goals[self._active_goal_id]
        return self._format_goal(record, current_date)

    def list_goals(self, today: Optional[dt.date] = None) -> list[GoalResponse]:
        current_date = today or get_current_date()
        with self._lock:
            records = list(self._goals.values())
        return [self._format_goal(r, current_date) for r in records]

    def _format_goal(self, record: dict, today: dt.date) -> GoalResponse:
        proj = calculate_goal_projection(
            target=record["target_amount"],
            allocated_savings=record["allocated_amount"],
            today=today,
            deadline=record["deadline"],
        )
        return GoalResponse(
            id=record["id"],
            title=record["title"],
            target_amount=record["target_amount"],
            deadline=record["deadline"],
            allocated_amount=record["allocated_amount"],
            remaining_target=proj.remaining_target,
            saving_days=proj.saving_days,
            suggested_daily_saving=proj.suggested_daily_saving,
            status=proj.status,
            is_completed=proj.is_completed,
            created_at=record["created_at"],
        )

    # --- Budget Summary ---

    def get_budget_summary(
        self,
        today: Optional[dt.date] = None,
        days_remaining: Optional[int] = None,
    ) -> BudgetSummaryResponse:
        current_date = today or get_current_date()

        with self._lock:
            all_tx = list(self._transactions.values())
            opening = self._opening_balance
            commitments = self._unpaid_commitments
            reserved = self._savings_reserved

            # Derive effective remaining days to month-end inclusively
            if days_remaining is not None:
                effective_days = days_remaining
            else:
                effective_days = calculate_days_remaining_to_month_end(current_date)

            # Allocated savings from active goal if any
            savings_allocated = 0
            if self._active_goal_id and self._active_goal_id in self._goals:
                savings_allocated = self._goals[self._active_goal_id]["allocated_amount"]

        # Derive cash
        total_income = sum(t["amount"] for t in all_tx if t["kind"] == "income")
        total_expense = sum(t["amount"] for t in all_tx if t["kind"] == "expense")
        cash = opening + total_income - total_expense

        # Calculate current safe to spend
        sts = calculate_safe_to_spend(
            cash=cash,
            unpaid_commitments=commitments,
            savings_allocated=savings_allocated,
            savings_reserved=reserved,
        )

        # Spending recorded for today
        spent_today = sum(
            t["amount"] for t in all_tx if t["kind"] == "expense" and t["date"] == current_date
        )

        # Compute start-of-day figure from unclamped discretionary_raw + spent_today
        # (Fixes review issue #2: prevents positive daily budget when user has shortfall)
        discretionary_raw_at_start = sts.discretionary_raw + spent_today
        safe_to_spend_at_start = max(0, discretionary_raw_at_start)

        # UC05: Budget Recovery calculation
        recovery = calculate_budget_recovery(
            safe_to_spend_at_start=safe_to_spend_at_start,
            days_remaining_inclusive=effective_days,
            spent_today=spent_today,
        )

        return BudgetSummaryResponse(
            cash=cash,
            total_income=total_income,
            total_expense=total_expense,
            unpaid_commitments=commitments,
            savings_allocated=savings_allocated,
            savings_reserved=reserved,
            protected=sts.protected,
            safe_to_spend=sts.safe_to_spend,
            funding_shortfall=sts.funding_shortfall,
            days_remaining=effective_days,
            daily_budget=recovery.initial_daily_allowance,
            spent_today=spent_today,
            remaining_today=recovery.remaining_today,
            is_overspent_today=recovery.is_overspent_today,
            overspent_amount_today=recovery.overspent_amount_today,
            subsequent_daily_budget=recovery.subsequent_daily_limit,
            is_period_exhausted=recovery.is_period_exhausted,
            engine="deterministic_zero_llm_math",
        )


# Global default repository instance
repository = InMemoryRepository()
