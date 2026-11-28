"""Exact VND expectations for the Phase 1 financial regression check."""

from datetime import date

import pytest

from app.budget import (
    BudgetRecoveryResult,
    GoalProjectionResult,
    SafeToSpendResult,
    calculate_budget_recovery,
    calculate_daily_allowance,
    calculate_goal_projection,
    calculate_safe_to_spend,
)


SAFE_TO_SPEND_CASES = (
    # Inputs: cash, commitments, allocated savings, reserved savings.
    # Expected: protected, raw discretionary, safe to spend, shortfall.
    ("no cash or obligations", (0, 0, 0, 0), SafeToSpendResult(0, 0, 0, 0)),
    ("cash only", (86_000, 0, 0, 0), SafeToSpendResult(0, 86_000, 86_000, 0)),
    ("fixed cost", (86_000, 30_000, 0, 0), SafeToSpendResult(30_000, 56_000, 56_000, 0)),
    ("planned saving", (86_000, 0, 0, 25_000), SafeToSpendResult(25_000, 61_000, 61_000, 0)),
    ("allocated saving", (86_000, 0, 16_000, 0), SafeToSpendResult(16_000, 70_000, 70_000, 0)),
    ("exactly covered", (86_000, 60_000, 16_000, 10_000), SafeToSpendResult(86_000, 0, 0, 0)),
    ("negative cash", (-5_000, 12_000, 0, 3_000), SafeToSpendResult(15_000, -20_000, 0, 20_000)),
)

DAILY_ALLOWANCE_CASES = (
    # Inputs: safe to spend, days remaining including today. Expected: allowance.
    ("exact division", (360_000, 12), 30_000),
    ("fractional đồng rounds down", (100_000, 3), 33_333),
    ("less than one đồng per day", (2, 3), 0),
    ("single day left", (100_001, 1), 100_001),
    ("no days left", (100_000, 0), 0),
    ("already expired", (100_000, -1), 0),
    ("nothing to spend", (0, 10), 0),
)

RECOVERY_CASES = (
    # Inputs: safe to spend at start of day, days including today, today's spend.
    # Expected: allowance, spend, today's remainder, overspent flag, overrun,
    # subsequent days, subsequent limit, budget remaining, exhaustion flag.
    (
        "no spending", (100, 4, 0),
        BudgetRecoveryResult(25, 0, 25, False, 0, 3, 33, 100, False),
    ),
    (
        "within allowance", (100, 4, 10),
        BudgetRecoveryResult(25, 10, 15, False, 0, 3, 30, 90, False),
    ),
    (
        "at allowance", (101, 4, 25),
        BudgetRecoveryResult(25, 25, 0, False, 0, 3, 25, 76, False),
    ),
    (
        "one đồng over", (100, 4, 26),
        BudgetRecoveryResult(25, 26, -1, True, 1, 3, 24, 74, False),
    ),
    (
        "spends the exact balance", (100, 4, 100),
        BudgetRecoveryResult(25, 100, -75, True, 75, 3, 0, 0, True),
    ),
    (
        "spends past the balance", (100, 4, 110),
        BudgetRecoveryResult(25, 110, -85, True, 85, 3, 0, 0, True),
    ),
    (
        "remaining funds below one đồng per day", (100, 4, 98),
        BudgetRecoveryResult(25, 98, -73, True, 73, 3, 0, 2, False),
    ),
    (
        "last day's underspend", (100, 1, 90),
        BudgetRecoveryResult(100, 90, 10, False, 0, 0, 0, 10, False),
    ),
    (
        "last day's overspend", (100, 1, 101),
        BudgetRecoveryResult(100, 101, -1, True, 1, 0, 0, 0, True),
    ),
    (
        "zero budget, positive spending", (0, 4, 10),
        BudgetRecoveryResult(0, 10, -10, True, 10, 3, 0, 0, True),
    ),
)

GOAL_DATE = date(2026, 7, 12)
GOAL_PROJECTION_CASES = (
    (
        "30-day savings projection", (2_000_000, 1_250_000, GOAL_DATE, date(2026, 8, 11)),
        GoalProjectionResult(2_000_000, 1_250_000, 750_000, 30, 25_000, "on_track", False),
    ),
    (
        "due today", (2_000_000, 1_250_000, GOAL_DATE, GOAL_DATE),
        GoalProjectionResult(2_000_000, 1_250_000, 750_000, 0, 750_000, "due_today", False),
    ),
    (
        "overdue", (2_000_000, 1_250_000, GOAL_DATE, date(2026, 7, 11)),
        GoalProjectionResult(2_000_000, 1_250_000, 750_000, 0, 0, "overdue", False),
    ),
)

GOLDEN_CASE_GROUPS = (
    (calculate_safe_to_spend, SAFE_TO_SPEND_CASES),
    (calculate_daily_allowance, DAILY_ALLOWANCE_CASES),
    (calculate_budget_recovery, RECOVERY_CASES),
    (calculate_goal_projection, GOAL_PROJECTION_CASES),
)


@pytest.mark.parametrize(
    ("cash", "commitments", "allocated", "reserved"),
    [
        pytest.param(3_000_000, 1_000_000, 200_000, 300_000, id="before-rent-payment"),
        pytest.param(2_000_000, 0, 200_000, 300_000, id="after-rent-payment"),
        pytest.param(2_000_000, 0, 300_000, 200_000, id="after-savings-allocation"),
    ],
)
def test_protected_transfers_preserve_discretionary_budget(cash, commitments, allocated, reserved):
    """Follow the rent and reservation example in implementation plan §7."""
    balance = calculate_safe_to_spend(cash, commitments, allocated, reserved)

    assert balance.safe_to_spend == 1_500_000
    assert balance.funding_shortfall == 0
    assert calculate_daily_allowance(balance.safe_to_spend, 15) == 100_000


@pytest.mark.parametrize(
    ("calculate", "inputs", "expected"),
    [
        pytest.param(calculate, inputs, expected, id=f"{calculate.__name__}: {scenario}")
        for calculate, cases in GOLDEN_CASE_GROUPS
        for scenario, inputs, expected in cases
    ],
)
def test_golden_budget_case_matches_exactly(calculate, inputs, expected):
    assert calculate(*inputs) == expected
