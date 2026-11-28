"""Pydantic schemas for CARENTA assistant orchestration and background job scheduling."""

from __future__ import annotations

import datetime as dt
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas import BudgetSummaryResponse

JobName = Literal["evening_reminder", "habit_analysis"]
ProactiveTriggerKind = Literal[
    "overspending_warning",
    "evening_reminder",
    "habit_suggestion",
]
ProactiveTriggerAction = Literal[
    "open_budget_recovery",
    "open_manual_entry",
    "open_stats",
    "open_habit_review",
]


class HabitCandidate(BaseModel):
    """Non-mutating recurring spending suggestion derived from confirmed history."""

    id: str
    date: dt.date
    amount: int = Field(gt=0)
    category: str = Field(min_length=1, max_length=50)
    note: str = Field(min_length=1, max_length=255)
    confidence: float = Field(ge=0.0, le=1.0)
    matching_days: int = Field(ge=1, le=31)


class ProactiveTrigger(BaseModel):
    """Server-evaluated, non-mutating proactive prompt for one Student Identity."""

    id: str
    kind: ProactiveTriggerKind
    title: str
    message: str
    action_target: ProactiveTriggerAction
    local_date: dt.date
    amount_vnd: int | None = Field(default=None, ge=0)
    habit_candidate: HabitCandidate | None = None
    created_at: dt.datetime


class ScheduledJobRunResponse(BaseModel):
    """Idempotent execution record for a scheduled assistant job."""

    job_name: JobName
    local_date: dt.date
    status: Literal["executed", "deduplicated", "skipped_no_action"]
    triggers_emitted: int = Field(ge=0)
    owners_evaluated: int = Field(ge=0)
    executed_at: dt.datetime


class JobScheduleSummary(BaseModel):
    """Current schedule configuration and latest run status for a single job."""

    job_name: JobName
    scheduled_time_local: str
    last_run_date: dt.date | None = None
    last_status: Literal["executed", "deduplicated", "skipped_no_action"] | None = None
    last_executed_at: dt.datetime | None = None


class JobStatusResponse(BaseModel):
    """Overview of the in-process scheduler and per-Student Identity job runs."""

    scheduler_enabled: bool
    scheduler_running: bool
    timezone: Literal["Asia/Ho_Chi_Minh"] = "Asia/Ho_Chi_Minh"
    jobs: list[JobScheduleSummary]


class AssistantInsight(BaseModel):
    """Coaching summary grounded in verified financial facts for one ledger revision."""

    summary: str
    source: Literal["provider", "deterministic_fallback"]
    ledger_revision: int = Field(ge=0)
    generated_at: dt.datetime


class AssistantSnapshotResponse(BaseModel):
    """Unified read-only view combining budget, insight, habit candidate, and triggers."""

    budget_summary: BudgetSummaryResponse
    insight: AssistantInsight
    active_triggers: list[ProactiveTrigger]
    habit_candidate: HabitCandidate | None = None
    ledger_revision: int = Field(ge=0)
    evaluated_at: dt.datetime


class ProactiveTriggerListResponse(BaseModel):
    """Active Proactive Triggers for one Student Identity."""

    items: list[ProactiveTrigger]
    total: int = Field(ge=0)


class TriggerDismissResponse(BaseModel):
    """Confirmation returned after dismissing a Proactive Trigger."""

    trigger_id: str
    status: Literal["dismissed"] = "dismissed"
    cooldown_until: dt.date | None = None


class ReadinessResponse(BaseModel):
    """Secret-free deployment and subsystem readiness summary."""

    status: Literal["ready", "degraded"]
    service: Literal["carenta-api"] = "carenta-api"
    auth_mode: Literal["supabase_jwt", "local_dev", "fail_closed_unconfigured"]
    scheduler_enabled: bool
    scheduler_running: bool
    insight_provider: Literal["configured", "deterministic_fallback"]
    subsystems: dict[str, str]

