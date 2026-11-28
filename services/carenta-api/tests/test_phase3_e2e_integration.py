"""Multi-day Phase 1-3 ASGI end-to-end integration test suite (#121, #59)."""

from __future__ import annotations

import asyncio
import datetime as dt

import httpx
from pydantic import SecretStr

from app.main import create_app
from app.repository import InMemoryRepository
from app.settings import SchedulerSettings
from tests.conftest import (
    MutableClock as _MutableClock,
    TEST_JWT_SECRET as TEST_SECRET,
    make_hs256_token as _make_token,
    strict_auth_config as _auth_config,
)

CRON_SECRET = "e2e-cron-secret-value-2026"


class _FlakyInsightProvider:
    def __init__(self) -> None:
        self.calls: list[int] = []
        self.fail_after_revision: int | None = None

    def generate_insight(self, *, user_id: str, budget_summary, ledger_revision: int, today: dt.date) -> str:
        del user_id, today
        self.calls.append(ledger_revision)
        if self.fail_after_revision is not None and ledger_revision >= self.fail_after_revision:
            raise TimeoutError("Gemini coaching timeout")
        return f"Tổng còn {budget_summary.safe_to_spend:,}đ cho {budget_summary.days_remaining} ngày.".replace(
            ",", "."
        )


def test_phase1_to_phase3_multi_day_e2e_lifecycle():
    # Start Day 6 at 07:35 Asia/Ho_Chi_Minh (00:35 UTC)
    clock = _MutableClock(dt.datetime(2026, 11, 28, 0, 35, tzinfo=dt.timezone.utc))
    provider = _FlakyInsightProvider()
    repo = InMemoryRepository()
    app = create_app(
        auth_config=_auth_config(),
        repository=repo,
        clock=clock,
        scheduler_config=SchedulerSettings(
            enabled=True,
            poll_interval_seconds=30.0,
            scheduler_secret=SecretStr(CRON_SECRET),
        ),
        insight_provider=provider,
    )

    headers_a = {"Authorization": f"Bearer {_make_token('student-a')}"}
    headers_b = {"Authorization": f"Bearer {_make_token('student-b')}"}

    async def run_scenario():
        transport = httpx.ASGITransport(app=app)
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                # 1. Public /health and /ready leak zero secrets
                health = await client.get("/health")
                ready = await client.get("/ready")
                assert health.status_code == 200
                assert ready.status_code == 200
                assert ready.json()["status"] == "ready"
                assert ready.json()["scheduler_running"] is True
                assert CRON_SECRET not in ready.text
                assert TEST_SECRET not in ready.text

                # 2. Protected routes fail closed
                assert (await client.get("/api/v1/assistant/snapshot")).status_code == 401

                # 3. Student A configures budget (Nov 28..30 -> 3 days, 300k => 100k/day) & goal
                assert (
                    await client.post(
                        "/api/v1/budget/config",
                        headers=headers_a,
                        json={
                            "opening_balance": 450000,
                            "unpaid_commitments": 0,
                            "savings_reserved": 0,
                        },
                    )
                ).status_code == 200
                assert (
                    await client.post(
                        "/api/v1/goal",
                        headers=headers_a,
                        json={
                            "title": "Tai nghe",
                            "target_amount": 900000,
                            "deadline": "2026-12-28",
                        },
                    )
                ).status_code == 201

                # Seed 5 consecutive days of 30k milk tea (Nov 23..27 -> 150k total spent)
                # Remaining cash on Nov 28 start = 450k - 150k = 300k => 100k/day
                for day_offset in range(1, 6):
                    tx = await client.post(
                        "/api/v1/transactions",
                        headers=headers_a,
                        json={
                            "amount": 30000,
                            "kind": "expense",
                            "category": "food",
                            "date": (dt.date(2026, 11, 28) - dt.timedelta(days=day_offset)).isoformat(),
                            "note": "Trà sữa",
                            "idempotency_key": f"e2e-habit-{day_offset}",
                        },
                    )
                    assert tx.status_code == 201

                # Seed Student B so internal sweep evaluates 2 owners
                assert (
                    await client.post(
                        "/api/v1/budget/config",
                        headers=headers_b,
                        json={"opening_balance": 200000},
                    )
                ).status_code == 200

                # 4. Internal cron habit analysis (07:35 VN) -> emits 1 non-mutating habit trigger
                # (lifespan tick may already have run it; either executed or deduplicated is valid)
                cron_res = await client.post(
                    "/api/v1/internal/jobs/habit_analysis/run",
                    headers={"X-Scheduler-Secret": CRON_SECRET},
                )
                assert cron_res.status_code == 200
                assert cron_res.json()["status"] in {"executed", "deduplicated"}
                assert (await client.get("/api/v1/transactions", headers=headers_a)).json()["total"] == 5

                # 5. Assistant Snapshot caches insight per revision
                snap1 = await client.get("/api/v1/assistant/snapshot", headers=headers_a)
                snap2 = await client.get("/api/v1/assistant/snapshot", headers=headers_a)
                assert snap1.status_code == 200
                assert snap2.status_code == 200
                assert snap1.json()["habit_candidate"]["amount"] == 30000
                assert snap1.json()["insight"]["source"] == "provider"
                assert len(provider.calls) == 1

                # 6. Student B cannot dismiss Student A's habit trigger; Student A dismisses -> 7d cooldown
                habit_trig_id = next(
                    t["id"] for t in snap1.json()["active_triggers"] if t["kind"] == "habit_suggestion"
                )
                assert (
                    await client.post(
                        f"/api/v1/assistant/triggers/{habit_trig_id}/dismiss",
                        headers=headers_b,
                    )
                ).status_code == 404
                dismiss_a = await client.post(
                    f"/api/v1/assistant/triggers/{habit_trig_id}/dismiss",
                    headers=headers_a,
                )
                assert dismiss_a.status_code == 200
                assert dismiss_a.json()["cooldown_until"] == "2026-12-05"

                # 7. Advance clock to 20:05 VN (13:05 UTC) -> evening reminder fires for A & B
                clock.current_utc = dt.datetime(2026, 11, 28, 13, 5, tzinfo=dt.timezone.utc)
                eve = await client.post(
                    "/api/v1/internal/jobs/evening_reminder/run",
                    headers={"X-Scheduler-Secret": CRON_SECRET},
                )
                assert eve.status_code == 200
                assert eve.json()["triggers_emitted"] == 2

                # 8. Student A logs an overspending expense (145k > 100k/day) while provider fails on new rev
                provider.fail_after_revision = snap1.json()["ledger_revision"] + 1
                over_tx = await client.post(
                    "/api/v1/transactions",
                    headers=headers_a,
                    json={
                        "amount": 145000,
                        "kind": "expense",
                        "category": "food",
                        "date": "2026-11-28",
                        "note": "Buffet",
                        "idempotency_key": "e2e-over-1",
                    },
                )
                assert over_tx.status_code == 201

                snap_after = await client.get("/api/v1/assistant/snapshot", headers=headers_a)
                assert snap_after.status_code == 200
                body_after = snap_after.json()
                assert body_after["insight"]["source"] == "deterministic_fallback"
                kinds = [t["kind"] for t in body_after["active_triggers"]]
                assert "evening_reminder" not in kinds
                assert kinds == ["overspending_warning"]
                assert body_after["active_triggers"][0]["amount_vnd"] == 45000

                # Student B still has their own evening reminder (tenant isolation)
                b_kinds = [
                    t["kind"]
                    for t in (await client.get("/api/v1/assistant/triggers", headers=headers_b)).json()["items"]
                ]
                assert b_kinds == ["evening_reminder"]

                # 9. Next day (Nov 29 08:00 VN): habit still suppressed by 7-day cooldown
                clock.current_utc = dt.datetime(2026, 11, 29, 1, 0, tzinfo=dt.timezone.utc)
                day7_habit = await client.post(
                    "/api/v1/jobs/habit_analysis/run",
                    headers=headers_a,
                )
                assert day7_habit.status_code == 200
                assert day7_habit.json()["status"] == "skipped_no_action"

        # Lifespan shutdown cleanly stopped the scheduler
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            ready_after = await client.get("/ready")
            assert ready_after.json()["scheduler_running"] is False

    asyncio.run(run_scenario())
