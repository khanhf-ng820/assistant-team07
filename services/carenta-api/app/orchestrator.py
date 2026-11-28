"""Unified Assistant Orchestrator, revision-keyed insight cache, and /ready builder."""

from __future__ import annotations

import datetime as dt
import threading
from typing import Literal, Protocol

from app.assistant_schemas import (
    AssistantInsight,
    AssistantSnapshotResponse,
    ProactiveTrigger,
    ProactiveTriggerListResponse,
    ReadinessResponse,
    TriggerDismissResponse,
)
from app.auth import AuthConfig
from app.errors import ApiHttpError
from app.repository import InMemoryRepository
from app.scheduler import (
    AssistantStateStore,
    BackgroundJobScheduler,
    Clock,
    default_utc_clock,
    format_vnd_dots,
    make_trigger_id,
    to_local_datetime,
)
from app.schemas import BudgetSummaryResponse, TransactionResponse

_TRIGGER_ORDER: dict[str, int] = {
    "overspending_warning": 0,
    "habit_suggestion": 1,
    "evening_reminder": 2,
}


class InsightProviderProtocol(Protocol):
    """Pluggable seam for AI coaching nudges grounded in verified budget facts."""

    def generate_insight(
        self,
        *,
        user_id: str,
        budget_summary: BudgetSummaryResponse,
        ledger_revision: int,
        today: dt.date,
    ) -> str: ...


class DeterministicInsightProvider:
    """Zero-LLM Vietnamese coaching summary derived strictly from verified integer VND."""

    def generate_insight(
        self,
        *,
        user_id: str,
        budget_summary: BudgetSummaryResponse,
        ledger_revision: int,
        today: dt.date,
    ) -> str:
        del user_id, ledger_revision, today
        if budget_summary.funding_shortfall > 0:
            return (
                f"Đang thiếu hụt {format_vnd_dots(budget_summary.funding_shortfall)}đ "
                "cho các khoản cố định và tiết kiệm. Hãy rà soát lại các khoản chi chưa cần thiết."
            )
        if budget_summary.is_overspent_today:
            return (
                f"Hôm nay bạn đã vượt hạn mức {format_vnd_dots(budget_summary.overspent_amount_today)}đ. "
                f"Hạn mức đề xuất các ngày còn lại là "
                f"{format_vnd_dots(budget_summary.subsequent_daily_budget)}đ/ngày."
            )
        if budget_summary.spent_today == 0:
            return (
                f"Bạn còn {format_vnd_dots(budget_summary.safe_to_spend)}đ có thể chi đến cuối tháng "
                f"({format_vnd_dots(budget_summary.daily_budget)}đ/ngày)."
            )
        return (
            f"Hôm nay đã chi {format_vnd_dots(budget_summary.spent_today)}đ, "
            f"còn {format_vnd_dots(budget_summary.remaining_today)}đ trong hạn mức ngày."
        )


class AssistantOrchestrator:
    """Coordinates ledger revisions, insight caching, and Proactive Trigger lifecycle."""

    def __init__(
        self,
        *,
        repo: InMemoryRepository,
        state_store: AssistantStateStore,
        scheduler: BackgroundJobScheduler,
        clock: Clock | None = None,
        insight_provider: InsightProviderProtocol | None = None,
    ) -> None:
        self._repo = repo
        self._state = state_store
        self._scheduler = scheduler
        self._clock = clock or default_utc_clock
        self._provider = insight_provider
        self._fallback = DeterministicInsightProvider()
        self._cache_lock = threading.Lock()
        self._insight_cache: dict[str, tuple[int, AssistantInsight]] = {}

    def invalidate_insights(self, user_id: str) -> None:
        with self._cache_lock:
            self._insight_cache.pop(user_id, None)

    def on_transaction_recorded(self, user_id: str, tx: TransactionResponse) -> None:
        """Update orchestration state after a confirmed transaction write."""
        self.invalidate_insights(user_id)
        local_now = to_local_datetime(self._clock)
        local_today = local_now.date()

        if tx.kind == "expense" and tx.date == local_today:
            self._state.remove_triggers_of_kind(
                user_id, "evening_reminder", local_date=local_today
            )

        self._reconcile_overspending_warning(user_id, local_now, local_today)

    def on_ledger_mutated(self, user_id: str) -> None:
        """Invalidate cached insights and reconcile overspending alerts after budget/goal changes."""
        self.invalidate_insights(user_id)
        local_now = to_local_datetime(self._clock)
        self._reconcile_overspending_warning(user_id, local_now, local_now.date())

    def get_snapshot(self, user_id: str) -> AssistantSnapshotResponse:
        """Assemble a read-only Assistant Snapshot for one Student Identity."""
        local_now = to_local_datetime(self._clock)
        local_today = local_now.date()
        budget_summary = self._repo.get_budget_summary(user_id, today=local_today)
        revision = self._repo.get_ledger_revision(user_id)

        self._reconcile_overspending_warning(
            user_id, local_now, local_today, budget_summary=budget_summary
        )
        insight = self._get_or_build_insight(
            user_id=user_id,
            budget_summary=budget_summary,
            ledger_revision=revision,
            local_now=local_now,
            local_today=local_today,
        )
        triggers = self._sorted_triggers(user_id, local_today=local_today)
        habit_candidate = self._state.get_active_habit_candidate(user_id, local_today)
        return AssistantSnapshotResponse(
            budget_summary=budget_summary,
            insight=insight,
            active_triggers=triggers,
            habit_candidate=habit_candidate,
            ledger_revision=revision,
            evaluated_at=local_now,
        )

    def list_triggers(self, user_id: str) -> ProactiveTriggerListResponse:
        local_today = to_local_datetime(self._clock).date()
        items = self._sorted_triggers(user_id, local_today=local_today)
        return ProactiveTriggerListResponse(items=items, total=len(items))

    def dismiss_trigger(self, user_id: str, trigger_id: str) -> TriggerDismissResponse:
        local_today = to_local_datetime(self._clock).date()
        found, cooldown_until = self._state.dismiss_trigger(
            user_id, trigger_id, local_today
        )
        if not found:
            raise ApiHttpError(404, "TRIGGER_NOT_FOUND", "Proactive trigger not found.")
        return TriggerDismissResponse(
            trigger_id=trigger_id,
            status="dismissed",
            cooldown_until=cooldown_until,
        )

    def build_readiness(self, auth_config: AuthConfig) -> ReadinessResponse:
        """Build a secret-free deployment readiness report."""
        auth_mode: Literal["supabase_jwt", "local_dev", "fail_closed_unconfigured"]
        if auth_config.local_dev_auth:
            auth_mode = "local_dev"
        elif auth_config.supabase_url or auth_config.jwt_secret:
            auth_mode = "supabase_jwt"
        else:
            auth_mode = "fail_closed_unconfigured"

        scheduler_enabled = self._scheduler.settings.enabled
        scheduler_running = self._scheduler.is_running
        scheduler_state = (
            "running"
            if scheduler_running
            else ("configured_stopped" if scheduler_enabled else "disabled")
        )
        overall_status: Literal["ready", "degraded"] = (
            "ready"
            if auth_mode in {"local_dev", "supabase_jwt"}
            and (not scheduler_enabled or scheduler_running)
            else "degraded"
        )
        provider_mode: Literal["configured", "deterministic_fallback"] = (
            "configured" if self._provider is not None else "deterministic_fallback"
        )
        return ReadinessResponse(
            status=overall_status,
            auth_mode=auth_mode,
            scheduler_enabled=scheduler_enabled,
            scheduler_running=scheduler_running,
            insight_provider=provider_mode,
            subsystems={
                "auth": auth_mode,
                "scheduler": scheduler_state,
                "insights": provider_mode,
                "repository": "in_memory",
            },
        )

    def _sorted_triggers(
        self, user_id: str, *, local_today: dt.date
    ) -> list[ProactiveTrigger]:
        triggers = self._state.list_triggers(user_id, local_date=local_today)
        triggers.sort(
            key=lambda trig: (
                _TRIGGER_ORDER.get(trig.kind, 99),
                -trig.created_at.timestamp(),
                trig.id,
            )
        )
        return triggers

    def _reconcile_overspending_warning(
        self,
        user_id: str,
        local_now: dt.datetime,
        local_today: dt.date,
        *,
        budget_summary: BudgetSummaryResponse | None = None,
    ) -> None:
        summary = budget_summary or self._repo.get_budget_summary(user_id, today=local_today)
        if not summary.is_overspent_today or summary.overspent_amount_today <= 0:
            self._state.remove_triggers_of_kind(user_id, "overspending_warning")
            return

        overrun = summary.overspent_amount_today
        trigger_id = make_trigger_id(
            user_id, "overspending_warning", local_today, str(overrun)
        )
        existing_same = any(
            trig.id == trigger_id
            for trig in self._state.list_triggers(user_id, local_date=local_today)
        )
        if existing_same or self._state.is_trigger_dismissed(user_id, trigger_id):
            return

        self._state.remove_triggers_of_kind(user_id, "overspending_warning")
        trigger = ProactiveTrigger(
            id=trigger_id,
            kind="overspending_warning",
            title="Cảnh báo vượt hạn mức ngày",
            message=(
                "Cảnh cáo vung tay quá trớn: Hôm nay bạn đã vượt hạn mức "
                f"{format_vnd_dots(overrun)}đ!"
            ),
            action_target="open_budget_recovery",
            local_date=local_today,
            amount_vnd=overrun,
            habit_candidate=None,
            created_at=local_now,
        )
        self._state.upsert_trigger(user_id, trigger)

    def _get_or_build_insight(
        self,
        *,
        user_id: str,
        budget_summary: BudgetSummaryResponse,
        ledger_revision: int,
        local_now: dt.datetime,
        local_today: dt.date,
    ) -> AssistantInsight:
        with self._cache_lock:
            cached = self._insight_cache.get(user_id)
            if cached is not None and cached[0] == ledger_revision:
                return cached[1]

        source: Literal["provider", "deterministic_fallback"] = "deterministic_fallback"
        summary_text: str | None = None

        if self._provider is not None:
            try:
                candidate = self._provider.generate_insight(
                    user_id=user_id,
                    budget_summary=budget_summary,
                    ledger_revision=ledger_revision,
                    today=local_today,
                )
                cleaned = candidate.strip() if isinstance(candidate, str) else ""
                if cleaned:
                    summary_text = cleaned
                    source = "provider"
            except Exception:
                summary_text = None

        if summary_text is None:
            summary_text = self._fallback.generate_insight(
                user_id=user_id,
                budget_summary=budget_summary,
                ledger_revision=ledger_revision,
                today=local_today,
            )
            source = "deterministic_fallback"

        insight = AssistantInsight(
            summary=summary_text,
            source=source,
            ledger_revision=ledger_revision,
            generated_at=local_now,
        )
        with self._cache_lock:
            self._insight_cache[user_id] = (ledger_revision, insight)
        return insight
