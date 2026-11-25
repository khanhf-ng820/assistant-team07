"""Pure deterministic budget calculation engine for CARENTA.

Implements 100% deterministic math with ZERO LLM calls for:
- Safe-to-Spend (Tiền còn lại, UC04)
- Daily Budget / Allowance (Hạn mức trong ngày)
- Budget Recovery (UC05: auto-recalculating remaining daily limits when overspending occurs)
- Goal Savings suggestions and projections with distinct due-today/overdue states
"""

from __future__ import annotations

import datetime as dt
import math
from typing import Literal, NamedTuple

GoalStatus = Literal["on_track", "due_today", "overdue", "completed"]


class SafeToSpendResult(NamedTuple):
    protected: int
    discretionary_raw: int
    safe_to_spend: int
    funding_shortfall: int


class BudgetRecoveryResult(NamedTuple):
    initial_daily_allowance: int
    spent_today: int
    remaining_today: int
    is_overspent_today: bool
    overspent_amount_today: int
    subsequent_days: int
    subsequent_daily_limit: int
    remaining_safe_to_spend: int
    is_period_exhausted: bool


class GoalProjectionResult(NamedTuple):
    target: int
    allocated: int
    remaining_target: int
    saving_days: int
    suggested_daily_saving: int
    status: GoalStatus
    is_completed: bool


def calculate_safe_to_spend(
    cash: int,
    unpaid_commitments: int,
    savings_allocated: int,
    savings_reserved: int,
) -> SafeToSpendResult:
    """Calculate Safe-to-Spend (Tiền còn lại, UC04) deterministically.

    Formula from docs/carenta-implementation-plan.md:
        protected = unpaid commitments + savings already allocated + savings still reserved
        discretionary_raw = cash - protected
        safe_to_spend = max(0, discretionary_raw)
        funding_shortfall = max(0, -discretionary_raw)
    """
    protected = int(unpaid_commitments + savings_allocated + savings_reserved)
    discretionary_raw = int(cash - protected)
    safe_to_spend = max(0, discretionary_raw)
    funding_shortfall = max(0, -discretionary_raw)

    return SafeToSpendResult(
        protected=protected,
        discretionary_raw=discretionary_raw,
        safe_to_spend=safe_to_spend,
        funding_shortfall=funding_shortfall,
    )


def calculate_daily_allowance(
    safe_to_spend: int,
    days_remaining_inclusive: int,
) -> int:
    """Calculate daily allowance at plan creation or start of day.

    Formula: floor(safe_to_spend / days_remaining_inclusive)
    All currency is rounded to integer VND.
    """
    if days_remaining_inclusive <= 0 or safe_to_spend <= 0:
        return 0
    return math.floor(safe_to_spend / days_remaining_inclusive)


def calculate_budget_recovery(
    safe_to_spend_at_start: int,
    days_remaining_inclusive: int,
    spent_today: int,
) -> BudgetRecoveryResult:
    """Dynamically adjust subsequent daily limits when spending/overspending occurs (UC05).

    - initial_daily_allowance: base limit allocated for today
    - spent_today: amount spent on discretionary purchases today
    - if spent_today > initial_daily_allowance: overspent today!
    - auto-recalculates remaining daily limit for the remaining subsequent days.
    """
    days = max(1, days_remaining_inclusive)
    initial_allowance = calculate_daily_allowance(safe_to_spend_at_start, days)

    remaining_today = initial_allowance - spent_today
    is_overspent = remaining_today < 0
    overspent_amount = abs(remaining_today) if is_overspent else 0

    # Remaining discretionary budget after today's actual spending
    remaining_safe_to_spend = max(0, safe_to_spend_at_start - spent_today)
    is_period_exhausted = (safe_to_spend_at_start - spent_today) <= 0

    subsequent_days = max(0, days - 1)
    if subsequent_days > 0 and remaining_safe_to_spend > 0:
        subsequent_daily_limit = math.floor(remaining_safe_to_spend / subsequent_days)
    else:
        subsequent_daily_limit = 0

    return BudgetRecoveryResult(
        initial_daily_allowance=initial_allowance,
        spent_today=spent_today,
        remaining_today=remaining_today,
        is_overspent_today=is_overspent,
        overspent_amount_today=overspent_amount,
        subsequent_days=subsequent_days,
        subsequent_daily_limit=subsequent_daily_limit,
        remaining_safe_to_spend=remaining_safe_to_spend,
        is_period_exhausted=is_period_exhausted,
    )


def calculate_goal_projection(
    target: int,
    allocated_savings: int,
    today: dt.date,
    deadline: dt.date,
) -> GoalProjectionResult:
    """Deterministic saving goal calculation.

    Matches specification in docs/carenta-implementation-plan.md (§7, line 205):
    - Completed goal: remaining == 0 -> completed, suggested 0
    - Past-due goal: deadline < today -> overdue, suggested 0, saving_days 0
    - Due-today goal: deadline == today -> due_today, suggested == remaining_target
    - On-track goal: deadline > today -> ceil(remaining_target / saving_days)
    """
    remaining_target = max(0, target - allocated_savings)
    is_completed = remaining_target == 0
    days_diff = (deadline - today).days

    if is_completed:
        return GoalProjectionResult(
            target=target,
            allocated=allocated_savings,
            remaining_target=0,
            saving_days=max(0, days_diff),
            suggested_daily_saving=0,
            status="completed",
            is_completed=True,
        )

    if days_diff < 0:
        # Past-due goal
        return GoalProjectionResult(
            target=target,
            allocated=allocated_savings,
            remaining_target=remaining_target,
            saving_days=0,
            suggested_daily_saving=0,
            status="overdue",
            is_completed=False,
        )

    if days_diff == 0:
        # Goal is due today! To meet the goal, the entire remaining amount is suggested today.
        return GoalProjectionResult(
            target=target,
            allocated=allocated_savings,
            remaining_target=remaining_target,
            saving_days=0,
            suggested_daily_saving=remaining_target,
            status="due_today",
            is_completed=False,
        )

    # Goal deadline is in the future
    saving_days = days_diff
    suggested_daily_saving = math.ceil(remaining_target / saving_days)

    return GoalProjectionResult(
        target=target,
        allocated=allocated_savings,
        remaining_target=remaining_target,
        saving_days=saving_days,
        suggested_daily_saving=suggested_daily_saving,
        status="on_track",
        is_completed=False,
    )
