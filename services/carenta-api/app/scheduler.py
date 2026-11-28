"""In-process background job scheduler and Proactive Trigger state store."""

from __future__ import annotations

import asyncio
import contextlib
import datetime as dt
import hashlib
import json
import logging
import threading
import unicodedata
from collections import Counter, defaultdict
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from typing import Protocol

from app.assistant_schemas import (
    HabitCandidate,
    JobName,
    JobScheduleSummary,
    JobStatusResponse,
    ProactiveTrigger,
    ScheduledJobRunResponse,
)
from app.repository import InMemoryRepository, LOCAL_TZ
from app.schemas import TransactionResponse
from app.settings import SchedulerSettings

Clock = Callable[[], dt.datetime]

HABIT_HISTORY_DAYS = 7
HABIT_MIN_MATCHING_DAYS = 5
HABIT_MIN_CONFIDENCE = 0.80
HABIT_DISMISSAL_DAYS = 7

HabitKey = tuple[str, str]


def default_utc_clock() -> dt.datetime:
    """Return the current UTC instant."""
    return dt.datetime.now(dt.timezone.utc)


def to_local_datetime(clock: Clock) -> dt.datetime:
    """Convert the clock's instant to Asia/Ho_Chi_Minh (UTC+7)."""
    instant = clock()
    if instant.tzinfo is None:
        instant = instant.replace(tzinfo=dt.timezone.utc)
    return instant.astimezone(LOCAL_TZ)


def to_local_date(clock: Clock) -> dt.date:
    """Return the current calendar date in Asia/Ho_Chi_Minh."""
    return to_local_datetime(clock).date()


def format_vnd_dots(amount: int) -> str:
    """Format an integer VND amount with dot thousands separators."""
    return f"{amount:,}".replace(",", ".")


logger = logging.getLogger(__name__)


def make_trigger_id(owner_id: str, kind: str, local_date: dt.date, salt: str = "") -> str:
    """Derive a deterministic trigger ID scoped to owner, kind, local date, and salt."""
    raw = json.dumps((owner_id, kind, local_date.isoformat(), salt), ensure_ascii=False)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


class HabitAnalyzerProtocol(Protocol):
    """Pluggable seam for recurring daily spending habit detection."""

    def detect_habit(
        self,
        expenses: Iterable[TransactionResponse],
        *,
        owner_id: str,
        today: dt.date,
        dismissed_until: Mapping[HabitKey, dt.date],
    ) -> tuple[HabitCandidate, HabitKey] | None: ...


class ConservativeHabitAnalyzer:
    """Default conservative daily-habit detector aligned with PR #97."""

    def detect_habit(
        self,
        expenses: Iterable[TransactionResponse],
        *,
        owner_id: str,
        today: dt.date,
        dismissed_until: Mapping[HabitKey, dt.date],
    ) -> tuple[HabitCandidate, HabitKey] | None:
        first_day = today - dt.timedelta(days=HABIT_HISTORY_DAYS)
        recent_day = today - dt.timedelta(days=2)
        groups: dict[HabitKey, dict[dt.date, list[TransactionResponse]]] = defaultdict(
            lambda: defaultdict(list)
        )
        recorded_today: set[HabitKey] = set()

        for tx in expenses:
            if tx.kind != "expense" or not (first_day <= tx.date <= today):
                continue
            note = " ".join(unicodedata.normalize("NFKC", tx.note or "").split()).casefold()
            if len(note) < 2:
                continue
            key = (tx.category, note)
            if tx.date == today:
                recorded_today.add(key)
            else:
                groups[key][tx.date].append(tx)

        candidates: list[tuple[HabitCandidate, HabitKey]] = []
        for key, days in groups.items():
            if key in recorded_today or dismissed_until.get(key, today) > today:
                continue

            unambiguous = [daily[0] for daily in days.values() if len(daily) == 1]
            if len(unambiguous) < HABIT_MIN_MATCHING_DAYS:
                continue
            amount, matching_days = Counter(item.amount for item in unambiguous).most_common(1)[0]
            if matching_days < HABIT_MIN_MATCHING_DAYS:
                continue
            most_recent = max(
                (item for item in unambiguous if item.amount == amount),
                key=lambda item: item.date,
            )
            coverage = matching_days / HABIT_HISTORY_DAYS
            stability = matching_days / len(days)
            confidence = round(0.7 * coverage + 0.3 * stability, 2)
            if most_recent.date < recent_day or confidence < HABIT_MIN_CONFIDENCE:
                continue

            identity_payload = json.dumps(
                (owner_id, today.isoformat(), *key, amount),
                ensure_ascii=False,
            )
            candidate_id = hashlib.sha256(identity_payload.encode("utf-8")).hexdigest()
            candidates.append(
                (
                    HabitCandidate(
                        id=candidate_id,
                        date=today,
                        amount=amount,
                        category=key[0],
                        note=most_recent.note or key[1],
                        confidence=confidence,
                        matching_days=matching_days,
                    ),
                    key,
                )
            )

        if not candidates:
            return None
        return min(candidates, key=lambda item: (-item[0].confidence, item[1]))


@dataclass
class _OwnerAssistantState:
    active_triggers: dict[str, ProactiveTrigger] = field(default_factory=dict)
    dismissed_trigger_ids: set[str] = field(default_factory=set)
    habit_dismissed_until: dict[HabitKey, dt.date] = field(default_factory=dict)
    trigger_habit_keys: dict[str, HabitKey] = field(default_factory=dict)
    job_runs: dict[tuple[JobName, dt.date], ScheduledJobRunResponse] = field(default_factory=dict)
    latest_job_run: dict[JobName, ScheduledJobRunResponse] = field(default_factory=dict)
    active_habit_candidate: HabitCandidate | None = None
    active_habit_key: HabitKey | None = None


class AssistantStateStore:
    """Thread-safe per-Student Identity state for Proactive Triggers and Scheduled Job Runs."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._owners: dict[str, _OwnerAssistantState] = {}

    def _get_or_create(self, owner_id: str) -> _OwnerAssistantState:
        state = self._owners.get(owner_id)
        if state is None:
            state = _OwnerAssistantState()
            self._owners[owner_id] = state
        return state

    def reset(self) -> None:
        with self._lock:
            self._owners.clear()

    def get_recorded_job_run(
        self, owner_id: str, job_name: JobName, local_date: dt.date
    ) -> ScheduledJobRunResponse | None:
        with self._lock:
            state = self._owners.get(owner_id)
            if state is None:
                return None
            return state.job_runs.get((job_name, local_date))

    def record_job_run(self, owner_id: str, run: ScheduledJobRunResponse) -> None:
        with self._lock:
            state = self._get_or_create(owner_id)
            state.job_runs[(run.job_name, run.local_date)] = run
            state.latest_job_run[run.job_name] = run

    def get_latest_job_runs(self, owner_id: str) -> dict[JobName, ScheduledJobRunResponse]:
        with self._lock:
            state = self._owners.get(owner_id)
            if state is None:
                return {}
            return dict(state.latest_job_run)

    def get_habit_dismissed_until(self, owner_id: str) -> dict[HabitKey, dt.date]:
        with self._lock:
            state = self._owners.get(owner_id)
            if state is None:
                return {}
            return dict(state.habit_dismissed_until)

    def upsert_trigger(
        self,
        owner_id: str,
        trigger: ProactiveTrigger,
        *,
        habit_key: HabitKey | None = None,
        respect_dismissed: bool = True,
    ) -> bool:
        """Store an active trigger unless already dismissed; returns True if newly added."""
        with self._lock:
            state = self._get_or_create(owner_id)
            if respect_dismissed and trigger.id in state.dismissed_trigger_ids:
                return False
            is_new = trigger.id not in state.active_triggers
            state.active_triggers[trigger.id] = trigger
            if habit_key is not None:
                state.trigger_habit_keys[trigger.id] = habit_key
                state.active_habit_candidate = trigger.habit_candidate
                state.active_habit_key = habit_key
            return is_new

    def remove_triggers_of_kind(
        self,
        owner_id: str,
        kind: str,
        *,
        local_date: dt.date | None = None,
    ) -> int:
        with self._lock:
            state = self._owners.get(owner_id)
            if state is None:
                return 0
            to_delete = [
                tid
                for tid, trig in state.active_triggers.items()
                if trig.kind == kind and (local_date is None or trig.local_date == local_date)
            ]
            for tid in to_delete:
                state.active_triggers.pop(tid, None)
                state.trigger_habit_keys.pop(tid, None)
            if kind == "habit_suggestion" and to_delete:
                state.active_habit_candidate = None
                state.active_habit_key = None
            return len(to_delete)

    def is_trigger_dismissed(self, owner_id: str, trigger_id: str) -> bool:
        with self._lock:
            state = self._owners.get(owner_id)
            return state is not None and trigger_id in state.dismissed_trigger_ids

    def list_triggers(
        self, owner_id: str, *, local_date: dt.date | None = None
    ) -> list[ProactiveTrigger]:
        with self._lock:
            state = self._owners.get(owner_id)
            if state is None:
                return []
            if local_date is not None:
                stale_ids = [
                    tid
                    for tid, trig in state.active_triggers.items()
                    if trig.local_date != local_date
                ]
                for tid in stale_ids:
                    state.active_triggers.pop(tid, None)
                    state.trigger_habit_keys.pop(tid, None)
                if state.active_habit_candidate is not None and state.active_habit_candidate.date != local_date:
                    state.active_habit_candidate = None
                    state.active_habit_key = None
            return list(state.active_triggers.values())

    def get_active_habit_candidate(
        self, owner_id: str, local_date: dt.date
    ) -> HabitCandidate | None:
        with self._lock:
            state = self._owners.get(owner_id)
            if state is None or state.active_habit_candidate is None:
                return None
            if state.active_habit_candidate.date != local_date:
                return None
            return state.active_habit_candidate

    def dismiss_trigger(
        self, owner_id: str, trigger_id: str, local_today: dt.date
    ) -> tuple[bool, dt.date | None]:
        """Mark a trigger dismissed; returns (found, cooldown_until)."""
        with self._lock:
            state = self._owners.get(owner_id)
            if state is None or trigger_id not in state.active_triggers:
                return False, None
            trigger = state.active_triggers.pop(trigger_id)
            state.dismissed_trigger_ids.add(trigger_id)
            cooldown_until: dt.date | None = None
            if trigger.kind == "habit_suggestion":
                habit_key = state.trigger_habit_keys.pop(trigger_id, None) or state.active_habit_key
                if habit_key is not None:
                    cooldown_until = local_today + dt.timedelta(days=HABIT_DISMISSAL_DAYS)
                    state.habit_dismissed_until[habit_key] = cooldown_until
                state.active_habit_candidate = None
                state.active_habit_key = None
            return True, cooldown_until


class BackgroundJobScheduler:
    """In-process asyncio scheduler and idempotent job runner."""

    def __init__(
        self,
        *,
        repo: InMemoryRepository,
        state_store: AssistantStateStore,
        settings: SchedulerSettings | None = None,
        clock: Clock | None = None,
        habit_analyzer: HabitAnalyzerProtocol | None = None,
    ) -> None:
        self._repo = repo
        self._state = state_store
        self._settings = settings or SchedulerSettings()
        self._clock = clock or default_utc_clock
        self._habit_analyzer = habit_analyzer or ConservativeHabitAnalyzer()
        self._run_lock = threading.RLock()
        self._task: asyncio.Task[None] | None = None
        self._stop_event: asyncio.Event | None = None

    @property
    def settings(self) -> SchedulerSettings:
        return self._settings

    @property
    def state_store(self) -> AssistantStateStore:
        return self._state

    @property
    def is_running(self) -> bool:
        return self._task is not None and not self._task.done()

    async def start(self) -> None:
        if not self._settings.enabled or self.is_running:
            return
        self._stop_event = asyncio.Event()
        self._task = asyncio.create_task(self._loop())

    async def stop(self) -> None:
        if self._task is None:
            return
        if self._stop_event is not None:
            self._stop_event.set()
        self._task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await self._task
        self._task = None
        self._stop_event = None

    async def _loop(self) -> None:
        assert self._stop_event is not None
        while not self._stop_event.is_set():
            try:
                self.tick()
            except Exception:
                logger.exception("Background scheduler tick failed")
            try:
                await asyncio.wait_for(
                    self._stop_event.wait(),
                    timeout=self._settings.poll_interval_seconds,
                )
            except TimeoutError:
                continue

    def tick(self) -> list[ScheduledJobRunResponse]:
        """Evaluate scheduled cutoffs at the current clock instant."""
        local_now = to_local_datetime(self._clock)
        local_time = local_now.time()
        results: list[ScheduledJobRunResponse] = []
        if local_time >= self._settings.habit_analysis_time:
            results.append(self.run_job_for_all_owners("habit_analysis"))
        if local_time >= self._settings.evening_reminder_time:
            results.append(self.run_job_for_all_owners("evening_reminder"))
        return results

    def run_job_for_owner(self, owner_id: str, job_name: JobName) -> ScheduledJobRunResponse:
        """Run one job idempotently for a single Student Identity."""
        with self._run_lock:
            local_now = to_local_datetime(self._clock)
            local_today = local_now.date()
            existing = self._state.get_recorded_job_run(owner_id, job_name, local_today)
            if existing is not None:
                return ScheduledJobRunResponse(
                    job_name=job_name,
                    local_date=local_today,
                    status="deduplicated",
                    triggers_emitted=0,
                    owners_evaluated=1,
                    executed_at=local_now,
                )

            if job_name == "evening_reminder":
                emitted = self._evaluate_evening_reminder(owner_id, local_now, local_today)
            else:
                emitted = self._evaluate_habit_analysis(owner_id, local_now, local_today)

            status: str = "executed" if emitted > 0 else "skipped_no_action"
            run = ScheduledJobRunResponse(
                job_name=job_name,
                local_date=local_today,
                status=status,  # type: ignore[arg-type]
                triggers_emitted=emitted,
                owners_evaluated=1,
                executed_at=local_now,
            )
            self._state.record_job_run(owner_id, run)
            return run

    def run_job_for_all_owners(self, job_name: JobName) -> ScheduledJobRunResponse:
        """Sweep all known Student Identities idempotently for internal cron triggers."""
        local_now = to_local_datetime(self._clock)
        local_today = local_now.date()
        owners = self._repo.list_owner_ids()
        if not owners:
            return ScheduledJobRunResponse(
                job_name=job_name,
                local_date=local_today,
                status="skipped_no_action",
                triggers_emitted=0,
                owners_evaluated=0,
                executed_at=local_now,
            )

        total_emitted = 0
        any_executed = False
        all_deduplicated = True
        for owner_id in owners:
            res = self.run_job_for_owner(owner_id, job_name)
            total_emitted += res.triggers_emitted
            if res.status != "deduplicated":
                all_deduplicated = False
            if res.status == "executed":
                any_executed = True

        if all_deduplicated:
            aggregate_status = "deduplicated"
        elif any_executed:
            aggregate_status = "executed"
        else:
            aggregate_status = "skipped_no_action"

        return ScheduledJobRunResponse(
            job_name=job_name,
            local_date=local_today,
            status=aggregate_status,  # type: ignore[arg-type]
            triggers_emitted=total_emitted,
            owners_evaluated=len(owners),
            executed_at=local_now,
        )

    def get_status(self, owner_id: str) -> JobStatusResponse:
        """Return scheduler status and latest per-job run summaries for one Student Identity."""
        latest = self._state.get_latest_job_runs(owner_id)
        schedule_times: dict[JobName, str] = {
            "habit_analysis": self._settings.habit_analysis_time.strftime("%H:%M"),
            "evening_reminder": self._settings.evening_reminder_time.strftime("%H:%M"),
        }
        summaries = [
            JobScheduleSummary(
                job_name=job_name,
                scheduled_time_local=schedule_times[job_name],
                last_run_date=latest[job_name].local_date if job_name in latest else None,
                last_status=latest[job_name].status if job_name in latest else None,
                last_executed_at=latest[job_name].executed_at if job_name in latest else None,
            )
            for job_name in ("habit_analysis", "evening_reminder")
        ]
        return JobStatusResponse(
            scheduler_enabled=self._settings.enabled,
            scheduler_running=self.is_running,
            jobs=summaries,
        )

    def _evaluate_evening_reminder(
        self, owner_id: str, local_now: dt.datetime, local_today: dt.date
    ) -> int:
        expenses_today = self._repo.list_transactions(
            owner_id, start_date=local_today, end_date=local_today, kind="expense"
        )
        if expenses_today:
            return 0
        trigger_id = make_trigger_id(owner_id, "evening_reminder", local_today)
        trigger = ProactiveTrigger(
            id=trigger_id,
            kind="evening_reminder",
            title="Nhắc ghi chi tiêu buổi tối",
            message="Buổi tối: Bạn chưa nhập khoản chi nào hôm nay",
            action_target="open_manual_entry",
            local_date=local_today,
            amount_vnd=None,
            habit_candidate=None,
            created_at=local_now,
        )
        return 1 if self._state.upsert_trigger(owner_id, trigger) else 0

    def _evaluate_habit_analysis(
        self, owner_id: str, local_now: dt.datetime, local_today: dt.date
    ) -> int:
        expenses = self._repo.list_transactions(
            owner_id,
            start_date=local_today - dt.timedelta(days=HABIT_HISTORY_DAYS),
            end_date=local_today,
            kind="expense",
        )
        detected = self._habit_analyzer.detect_habit(
            expenses,
            owner_id=owner_id,
            today=local_today,
            dismissed_until=self._state.get_habit_dismissed_until(owner_id),
        )
        if detected is None:
            return 0

        candidate, habit_key = detected
        trigger_id = make_trigger_id(owner_id, "habit_suggestion", local_today, candidate.id)
        formatted_amount = format_vnd_dots(candidate.amount)
        trigger = ProactiveTrigger(
            id=trigger_id,
            kind="habit_suggestion",
            title="Gợi ý thói quen chi tiêu",
            message=(
                f"AI phát hiện thói quen: Bạn có chi {candidate.note} "
                f"{formatted_amount}đ như thường lệ không?"
            ),
            action_target="open_habit_review",
            local_date=local_today,
            amount_vnd=candidate.amount,
            habit_candidate=candidate,
            created_at=local_now,
        )
        return 1 if self._state.upsert_trigger(owner_id, trigger, habit_key=habit_key) else 0
