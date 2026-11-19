"""Pure deterministic budget calculation engine for CARENTA.

Implements 100% deterministic math with ZERO LLM calls for:
- Safe-to-Spend (Tiền còn lại, UC04)
- Daily Budget / Allowance (Hạn mức trong ngày)
- Budget Recovery (UC05: auto-recalculating remaining daily limits when overspending occurs)
- Goal Savings suggestions and projections
"""

from __future__ import annotations

import math
from datetime import date
from typing import NamedTuple


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
    today: date,
    deadline: date,
) -> GoalProjectionResult:
    """Deterministic saving goal calculation.

    Matches golden specification in docs/carenta-implementation-plan.md:
        remaining_target = max(0, target - allocated_savings)
        saving_days = deadline_local_date - today_local_date
        suggested_daily_saving = ceil(remaining_target / saving_days)
    Example:
        target: 2,000,000 VND, allocated: 1,250,000 VND
        today: 2026-07-12, deadline: 2026-08-11 -> 30 days
        remaining: 750,000 VND -> suggested: 25,000 VND/day
    """
    remaining_target = max(0, target - allocated_savings)
    is_completed = remaining_target == 0

    saving_days = max(0, (deadline - today).days)
    if saving_days > 0 and remaining_target > 0:
        suggested_daily_saving = math.ceil(remaining_target / saving_days)
    else:
        suggested_daily_saving = 0

    return GoalProjectionResult(
        target=target,
        allocated=allocated_savings,
        remaining_target=remaining_target,
        saving_days=saving_days,
        suggested_daily_saving=suggested_daily_saving,
        is_completed=is_completed,
    )
