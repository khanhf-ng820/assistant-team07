"""In-memory data repository for CARENTA API, partitioned per Student Identity.

Architecture Note:
    Phase 1 per-`user_id` in-memory store mirroring #42's `owner_id` isolation
    invariants (per-owner idempotency keys, one active goal per owner, isolated
    budget parameters and transactions) behind a clean repository seam until live
    Supabase Postgres persistence replaces the in-memory backend.
"""

from __future__ import annotations

from dataclasses import dataclass, field
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


@dataclass
class _OwnerLedger:
    transactions: dict[str, dict] = field(default_factory=dict)
    idempotency_map: dict[str, str] = field(default_factory=dict)  # idempotency_key -> transaction_id
    goals: dict[str, dict] = field(default_factory=dict)
    active_goal_id: Optional[str] = None
    opening_balance: int = 0
    unpaid_commitments: int = 0
    savings_reserved: int = 0
    revision: int = 0


def _require_owner_id(user_id: str) -> str:
    cleaned = user_id.strip() if isinstance(user_id, str) else ""
    if not cleaned:
        raise ValueError("user_id must be a non-empty string")
    return cleaned


class InMemoryRepository:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._ledgers: dict[str, _OwnerLedger] = {}

    def _get_or_create_ledger(self, owner_id: str) -> _OwnerLedger:
        ledger = self._ledgers.get(owner_id)
        if ledger is None:
            ledger = _OwnerLedger()
            self._ledgers[owner_id] = ledger
        return ledger

    def _active_goal_record(
        self, owner_id: str
    ) -> tuple[Optional[_OwnerLedger], Optional[dict]]:
        ledger = self._ledgers.get(owner_id)
        if ledger is None or not ledger.active_goal_id:
            return ledger, None
        return ledger, ledger.goals.get(ledger.active_goal_id)

    def reset(self) -> None:
        """Clear all stored data (useful for test isolation)."""
        with self._lock:
            self._ledgers.clear()

    def get_ledger_revision(self, user_id: str) -> int:
        owner_id = _require_owner_id(user_id)
        with self._lock:
            ledger = self._ledgers.get(owner_id)
            return ledger.revision if ledger is not None else 0

    def list_owner_ids(self) -> list[str]:
        with self._lock:
            return sorted(self._ledgers.keys())

    def configure_budget(
        self,
        user_id: str,
        opening_balance: int | None = None,
        unpaid_commitments: int | None = None,
        savings_reserved: int | None = None,
    ) -> None:
        owner_id = _require_owner_id(user_id)
        with self._lock:
            ledger = self._get_or_create_ledger(owner_id)
            changed = False
            if opening_balance is not None:
                ledger.opening_balance = opening_balance
                changed = True
            if unpaid_commitments is not None:
                ledger.unpaid_commitments = unpaid_commitments
                changed = True
            if savings_reserved is not None:
                ledger.savings_reserved = savings_reserved
                changed = True
            if changed:
                ledger.revision += 1

    # --- Transactions ---

    def create_transaction(self, user_id: str, data: TransactionCreate) -> TransactionResponse:
        owner_id = _require_owner_id(user_id)
        with self._lock:
            ledger = self._get_or_create_ledger(owner_id)
            # Check per-owner idempotency (matches SQL unique (owner_id, idempotency_key))
            if data.idempotency_key in ledger.idempotency_map:
                existing_id = ledger.idempotency_map[data.idempotency_key]
                record = dict(ledger.transactions[existing_id])
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
            ledger.transactions[tx_id] = record
            ledger.idempotency_map[data.idempotency_key] = tx_id
            ledger.revision += 1
            snapshot = dict(record)

        return TransactionResponse(**snapshot)

    def list_transactions(
        self,
        user_id: str,
        start_date: Optional[dt.date] = None,
        end_date: Optional[dt.date] = None,
        kind: Optional[str] = None,
    ) -> list[TransactionResponse]:
        owner_id = _require_owner_id(user_id)
        with self._lock:
            ledger = self._ledgers.get(owner_id)
            if ledger is None:
                return []
            items = [dict(item) for item in ledger.transactions.values()]

        if start_date:
            items = [item for item in items if item["date"] >= start_date]
        if end_date:
            items = [item for item in items if item["date"] <= end_date]
        if kind:
            items = [item for item in items if item["kind"] == kind]

        # Sort descending by date, then created_at
        items.sort(key=lambda x: (x["date"], x["created_at"]), reverse=True)
        return [TransactionResponse(**item) for item in items]

    def get_transaction(self, user_id: str, tx_id: str) -> Optional[TransactionResponse]:
        owner_id = _require_owner_id(user_id)
        with self._lock:
            ledger = self._ledgers.get(owner_id)
            if ledger is None:
                return None
            record = ledger.transactions.get(tx_id)
            snapshot = dict(record) if record else None
        if snapshot:
            return TransactionResponse(**snapshot)
        return None

    # --- Goals ---

    def set_active_goal(
        self, user_id: str, data: GoalCreate, today: Optional[dt.date] = None
    ) -> GoalResponse:
        """Create the single active goal for an owner. Rejects client-supplied balance overrides.

        Raises ActiveGoalExistsError if this owner already has an active goal, so money
        already allocated to it can never silently become spendable. Use update_active_goal.
        """
        owner_id = _require_owner_id(user_id)
        current_date = today or get_current_date()
        with self._lock:
            ledger = self._get_or_create_ledger(owner_id)
            if ledger.active_goal_id and ledger.active_goal_id in ledger.goals:
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
            ledger.goals[goal_id] = record
            ledger.active_goal_id = goal_id
            ledger.revision += 1
            snapshot = dict(record)

        return self._format_goal(snapshot, current_date)

    def update_active_goal(
        self, user_id: str, data: GoalUpdate, today: Optional[dt.date] = None
    ) -> Optional[GoalResponse]:
        """Update owner's existing active goal while strictly preserving allocated savings."""
        owner_id = _require_owner_id(user_id)
        current_date = today or get_current_date()
        with self._lock:
            ledger, record = self._active_goal_record(owner_id)
            if ledger is None or record is None:
                return None
            changed = False
            if data.title is not None:
                record["title"] = data.title
                changed = True
            if data.target_amount is not None:
                record["target_amount"] = data.target_amount
                changed = True
            if data.deadline is not None:
                record["deadline"] = data.deadline
                changed = True
            if changed:
                ledger.revision += 1
            snapshot = dict(record)

        return self._format_goal(snapshot, current_date)

    def allocate_to_active_goal(
        self, user_id: str, amount: int, today: Optional[dt.date] = None
    ) -> Optional[GoalResponse]:
        """Allocate virtual savings to owner's active goal.

        Plan §7: allocation moves value from the owner's still-reserved savings into
        allocated savings. Only the part above the reserve reduces discretionary funds.
        """
        owner_id = _require_owner_id(user_id)
        current_date = today or get_current_date()
        with self._lock:
            ledger, record = self._active_goal_record(owner_id)
            if ledger is None or record is None:
                return None
            record["allocated_amount"] += amount
            ledger.savings_reserved -= min(amount, ledger.savings_reserved)
            ledger.revision += 1
            snapshot = dict(record)

        return self._format_goal(snapshot, current_date)

    def get_active_goal(self, user_id: str, today: Optional[dt.date] = None) -> Optional[GoalResponse]:
        owner_id = _require_owner_id(user_id)
        current_date = today or get_current_date()
        with self._lock:
            _, record = self._active_goal_record(owner_id)
            if record is None:
                return None
            snapshot = dict(record)
        return self._format_goal(snapshot, current_date)

    def list_goals(self, user_id: str, today: Optional[dt.date] = None) -> list[GoalResponse]:
        owner_id = _require_owner_id(user_id)
        current_date = today or get_current_date()
        with self._lock:
            ledger = self._ledgers.get(owner_id)
            if ledger is None:
                return []
            records = [dict(r) for r in ledger.goals.values()]
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
        user_id: str,
        today: Optional[dt.date] = None,
        days_remaining: Optional[int] = None,
    ) -> BudgetSummaryResponse:
        owner_id = _require_owner_id(user_id)
        current_date = today or get_current_date()

        with self._lock:
            ledger, active_goal = self._active_goal_record(owner_id)
            if ledger is None:
                all_tx: list[dict] = []
                opening = 0
                commitments = 0
                reserved = 0
                savings_allocated = 0
            else:
                all_tx = [dict(t) for t in ledger.transactions.values()]
                opening = ledger.opening_balance
                commitments = ledger.unpaid_commitments
                reserved = ledger.savings_reserved
                savings_allocated = active_goal["allocated_amount"] if active_goal else 0

            # Derive effective remaining days to month-end inclusively
            if days_remaining is not None:
                effective_days = days_remaining
            else:
                effective_days = calculate_days_remaining_to_month_end(current_date)

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
