"""Tests for deterministic budget calculation engine (UC04, UC05, Goal Projections).

Verifies 100% deterministic math without any external AI/LLM dependency,
covering edge cases (zero days, zero income, funding shortfall, overspending recovery).
"""

from datetime import date
from app.budget import (
    calculate_budget_recovery,
    calculate_daily_allowance,
    calculate_goal_projection,
    calculate_safe_to_spend,
)


def test_safe_to_spend_matches_implementation_plan_golden_example():
    """Verify example from docs/carenta-implementation-plan.md line 213:
    cash is 3,000,000 VND; unpaid rent is 1,000,000 VND;
    allocated savings are 200,000 VND; additional reserved savings are 300,000 VND.
    Discretionary funds are 1,500,000 VND.
    With 15 days remaining, daily allowance is 100,000 VND.
    """
    res = calculate_safe_to_spend(
        cash=3_000_000,
        unpaid_commitments=1_000_000,
        savings_allocated=200_000,
        savings_reserved=300_000,
    )
    assert res.protected == 1_500_000
    assert res.discretionary_raw == 1_500_000
    assert res.safe_to_spend == 1_500_000
    assert res.funding_shortfall == 0

    daily = calculate_daily_allowance(res.safe_to_spend, days_remaining_inclusive=15)
    assert daily == 100_000


def test_safe_to_spend_with_shortfall():
    """When commitments and savings exceed available cash, shortfall is explicitly flagged."""
    res = calculate_safe_to_spend(
        cash=500_000,
        unpaid_commitments=1_000_000,
        savings_allocated=200_000,
        savings_reserved=0,
    )
    assert res.protected == 1_200_000
    assert res.discretionary_raw == -700_000
    assert res.safe_to_spend == 0
    assert res.funding_shortfall == 700_000

    daily = calculate_daily_allowance(res.safe_to_spend, days_remaining_inclusive=10)
    assert daily == 0


def test_daily_allowance_boundary_conditions():
    """Check boundary edge cases: 0 days remaining, negative days, 0 safe_to_spend."""
    assert calculate_daily_allowance(safe_to_spend=100_000, days_remaining_inclusive=0) == 0
    assert calculate_daily_allowance(safe_to_spend=100_000, days_remaining_inclusive=-5) == 0
    assert calculate_daily_allowance(safe_to_spend=0, days_remaining_inclusive=10) == 0


def test_budget_recovery_under_normal_spending():
    """When user spends within today's allowance, subsequent daily limit is preserved or adjusted."""
    # 1,500,000 safe-to-spend across 15 days -> initial daily allowance = 100,000
    # User spends 80,000 today
    recovery = calculate_budget_recovery(
        safe_to_spend_at_start=1_500_000,
        days_remaining_inclusive=15,
        spent_today=80_000,
    )
    assert recovery.initial_daily_allowance == 100_000
    assert recovery.spent_today == 80_000
    assert recovery.remaining_today == 20_000
    assert recovery.is_overspent_today is False
    assert recovery.overspent_amount_today == 0
    assert recovery.subsequent_days == 14
    # Remaining safe to spend = 1,420,000 over 14 days = 101,428 VND/day
    assert recovery.subsequent_daily_limit == 101_428
    assert recovery.is_period_exhausted is False


def test_budget_recovery_under_overspending_uc05():
    """UC05: When user overspends today, subsequent daily limits are dynamically reduced."""
    # 1,500,000 safe-to-spend across 15 days -> initial daily allowance = 100,000
    # User overspends by spending 240,000 today (140,000 over budget)
    recovery = calculate_budget_recovery(
        safe_to_spend_at_start=1_500_000,
        days_remaining_inclusive=15,
        spent_today=240_000,
    )
    assert recovery.initial_daily_allowance == 100_000
    assert recovery.spent_today == 240_000
    assert recovery.remaining_today == -140_000
    assert recovery.is_overspent_today is True
    assert recovery.overspent_amount_today == 140_000
    assert recovery.subsequent_days == 14
    # Remaining safe to spend = 1,500,000 - 240,000 = 1,260,000 over 14 days = 90,000 VND/day
    assert recovery.subsequent_daily_limit == 90_000
    assert recovery.is_period_exhausted is False


def test_budget_recovery_complete_exhaustion():
    """When user spends more than entire remaining safe-to-spend."""
    recovery = calculate_budget_recovery(
        safe_to_spend_at_start=500_000,
        days_remaining_inclusive=5,
        spent_today=600_000,
    )
    assert recovery.initial_daily_allowance == 100_000
    assert recovery.remaining_today == -500_000
    assert recovery.is_overspent_today is True
    assert recovery.subsequent_daily_limit == 0
    assert recovery.remaining_safe_to_spend == 0
    assert recovery.is_period_exhausted is True


def test_goal_projection_golden_example():
    """Verify golden example from docs/carenta-implementation-plan.md line 203:
    Frozen date: 12 July 2026, deadline: 11 August 2026.
    Target: 2,000,000 VND, already saved: 1,250,000 VND.
    Remaining target: 750,000 VND across 30 days -> exactly 25,000 VND/day.
    """
    proj = calculate_goal_projection(
        target=2_000_000,
        allocated_savings=1_250_000,
        today=date(2026, 7, 12),
        deadline=date(2026, 8, 11),
    )
    assert proj.remaining_target == 750_000
    assert proj.saving_days == 30
    assert proj.suggested_daily_saving == 25_000
    assert proj.is_completed is False


def test_goal_projection_completed_or_past_due():
    """Goal already met or deadline passed."""
    # Completed goal
    proj_done = calculate_goal_projection(
        target=1_000_000,
        allocated_savings=1_000_000,
        today=date(2026, 7, 12),
        deadline=date(2026, 8, 11),
    )
    assert proj_done.remaining_target == 0
    assert proj_done.suggested_daily_saving == 0
    assert proj_done.is_completed is True

    # Past due goal
    proj_past = calculate_goal_projection(
        target=1_000_000,
        allocated_savings=500_000,
        today=date(2026, 8, 15),
        deadline=date(2026, 8, 11),
    )
    assert proj_past.saving_days == 0
    assert proj_past.suggested_daily_saving == 0
    assert proj_past.is_completed is False
