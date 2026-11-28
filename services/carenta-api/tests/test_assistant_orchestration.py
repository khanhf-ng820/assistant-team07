"""ASGI tests for Assistant Snapshot, Proactive Trigger lifecycle, insight cache and /ready (#119)."""

from __future__ import annotations

import asyncio
import datetime as dt
from dataclasses import dataclass

import httpx
import jwt
import pytest
from pydantic import SecretStr

from app.auth import AuthConfig
from app.main import create_app
from app.repository import InMemoryRepository
from app.settings import SchedulerSettings

TEST_SECRET = "test-hmac-secret-at-least-32-bytes-long"
TEST_ISSUER = "https://proj.supabase.co/auth/v1"


def _make_token(sub: str = "student-a") -> str:
    now = dt.datetime.now(dt.timezone.utc)
    return jwt.encode(
        {
            "sub": sub,
            "email": f"{sub}@hcmus.edu.vn",
            "role": "authenticated",
            "aud": "authenticated",
            "iss": TEST_ISSUER,
            "iat": int(now.timestamp()),
            "exp": int((now + dt.timedelta(hours=1)).timestamp()),
        },
        TEST_SECRET,
        algorithm="HS256",
    )


def _auth_config() -> AuthConfig:
    return AuthConfig(
        supabase_url="https://proj.supabase.co",
        jwt_secret=TEST_SECRET,
        local_dev_auth=False,
    )


@dataclass
class _MutableClock:
    current_utc: dt.datetime

    def __call__(self) -> dt.datetime:
        return self.current_utc


class _RecordingInsightProvider:
    def __init__(self, *, should_fail: bool = False) -> None:
        self.calls: list[tuple[str, int]] = []
        self.should_fail = should_fail

    def generate_insight(self, *, user_id: str, budget_summary, ledger_revision: int, today: dt.date) -> str:
        self.calls.append((user_id, ledger_revision))
        if self.should_fail:
            raise RuntimeError("Upstream insight provider unavailable")
        return (
            f"Gợi ý rev {ledger_revision}: còn {budget_summary.safe_to_spend:,}đ "
            f"cho {budget_summary.days_remaining} ngày."
        ).replace(",", ".")


def _request(
    application,
    method: str,
    path: str,
    *,
    json: dict | None = None,
    headers: dict[str, str] | None = None,
):
    async def run():
        transport = httpx.ASGITransport(app=application)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, path, json=json, headers=headers)

    return asyncio.run(run())


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("GET", "/api/v1/assistant/snapshot"),
        ("GET", "/v1/assistant/snapshot"),
        ("GET", "/api/v1/assistant/triggers"),
        ("GET", "/v1/assistant/triggers"),
        ("POST", "/api/v1/assistant/triggers/trig-1/dismiss"),
        ("POST", "/v1/assistant/triggers/trig-1/dismiss"),
    ],
)
def test_assistant_routes_fail_closed_without_auth(method: str, path: str):
    app = create_app(auth_config=_auth_config(), repository=InMemoryRepository())
    res = _request(app, method, path)
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "AUTH_REQUIRED"


def test_transaction_hooks_resolve_evening_reminder_and_emit_then_clear_overspending():
    clock = _MutableClock(dt.datetime(2026, 11, 28, 13, 5, tzinfo=dt.timezone.utc))  # 20:05 VN
    repo = InMemoryRepository()
    app = create_app(auth_config=_auth_config(), repository=repo, clock=clock)
    headers = {"Authorization": f"Bearer {_make_token('student-a')}"}

    # Configure Nov 28..30 (3 days remaining): 300,000 opening -> 100,000/day
    cfg_res = _request(
        app,
        "POST",
        "/api/v1/budget/config",
        headers=headers,
        json={"opening_balance": 300000, "unpaid_commitments": 0, "savings_reserved": 0},
    )
    assert cfg_res.status_code == 200

    # Evening reminder fires since 0 expenses today
    job_res = _request(app, "POST", "/api/v1/jobs/evening_reminder/run", headers=headers)
    assert job_res.status_code == 200
    assert job_res.json()["triggers_emitted"] == 1

    triggers_before = _request(app, "GET", "/api/v1/assistant/triggers", headers=headers)
    assert triggers_before.status_code == 200
    assert [t["kind"] for t in triggers_before.json()["items"]] == ["evening_reminder"]

    # Record an overspending expense (145,000 > 100,000 daily budget => 45,000 overrun)
    # Response must remain 100% TransactionResponse schema-compatible.
    tx_res = _request(
        app,
        "POST",
        "/api/v1/transactions",
        headers=headers,
        json={
            "amount": 145000,
            "kind": "expense",
            "category": "food",
            "date": "2026-11-28",
            "note": "Lau Thai",
            "idempotency_key": "tx-over-1",
        },
    )
    assert tx_res.status_code == 201
    assert set(tx_res.json().keys()) == {
        "id",
        "amount",
        "kind",
        "category",
        "date",
        "note",
        "idempotency_key",
        "created_at",
    }

    # Evening reminder auto-resolved, overspending warning emitted immediately
    triggers_after = _request(app, "GET", "/v1/assistant/triggers", headers=headers)
    assert triggers_after.status_code == 200
    items = triggers_after.json()["items"]
    assert len(items) == 1
    assert items[0]["kind"] == "overspending_warning"
    assert items[0]["amount_vnd"] == 45000
    assert "45.000đ" in items[0]["message"]
    assert items[0]["action_target"] == "open_budget_recovery"

    # Raising opening balance clears the overspending warning on ledger mutation
    recover_res = _request(
        app,
        "POST",
        "/api/v1/budget/config",
        headers=headers,
        json={"opening_balance": 900000},
    )
    assert recover_res.status_code == 200
    triggers_recovered = _request(app, "GET", "/api/v1/assistant/triggers", headers=headers)
    assert triggers_recovered.status_code == 200
    assert triggers_recovered.json()["total"] == 0


def test_snapshot_caches_insights_per_revision_and_falls_back_on_provider_error():
    clock = _MutableClock(dt.datetime(2026, 11, 28, 1, 0, tzinfo=dt.timezone.utc))  # 08:00 VN
    provider = _RecordingInsightProvider()
    repo = InMemoryRepository()
    app = create_app(
        auth_config=_auth_config(),
        repository=repo,
        clock=clock,
        insight_provider=provider,
    )
    headers = {"Authorization": f"Bearer {_make_token('student-a')}"}

    snap1 = _request(app, "GET", "/api/v1/assistant/snapshot", headers=headers)
    snap2 = _request(app, "GET", "/v1/assistant/snapshot", headers=headers)
    assert snap1.status_code == 200
    assert snap2.status_code == 200
    assert snap1.json()["ledger_revision"] == 0
    assert snap1.json()["insight"]["source"] == "provider"
    assert len(provider.calls) == 1  # cached for (student-a, rev 0)

    # Ledger mutation bumps revision and invalidates cached insight
    _request(
        app,
        "POST",
        "/api/v1/budget/config",
        headers=headers,
        json={"opening_balance": 600000},
    )
    snap3 = _request(app, "GET", "/api/v1/assistant/snapshot", headers=headers)
    assert snap3.status_code == 200
    assert snap3.json()["ledger_revision"] == 1
    assert len(provider.calls) == 2

    # Provider failure on a new revision falls back safely to deterministic Vietnamese insight
    provider.should_fail = True
    _request(
        app,
        "POST",
        "/api/v1/goal",
        headers=headers,
        json={"title": "Laptop", "target_amount": 1500000, "deadline": "2026-12-28"},
    )
    snap4 = _request(app, "GET", "/api/v1/assistant/snapshot", headers=headers)
    assert snap4.status_code == 200
    assert snap4.json()["ledger_revision"] == 2
    assert snap4.json()["insight"]["source"] == "deterministic_fallback"
    assert snap4.json()["insight"]["summary"]


def test_dismiss_trigger_enforces_tenant_isolation_and_7_day_habit_cooldown():
    clock = _MutableClock(dt.datetime(2026, 11, 28, 1, 0, tzinfo=dt.timezone.utc))  # 08:00 VN
    repo = InMemoryRepository()
    app = create_app(auth_config=_auth_config(), repository=repo, clock=clock)
    headers_a = {"Authorization": f"Bearer {_make_token('student-a')}"}
    headers_b = {"Authorization": f"Bearer {_make_token('student-b')}"}

    for day_offset in range(1, 6):
        _request(
            app,
            "POST",
            "/api/v1/transactions",
            headers=headers_a,
            json={
                "amount": 30000,
                "kind": "expense",
                "category": "food",
                "date": (dt.date(2026, 11, 28) - dt.timedelta(days=day_offset)).isoformat(),
                "note": "Trà sữa",
                "idempotency_key": f"cool-a-{day_offset}",
            },
        )

    _request(app, "POST", "/api/v1/jobs/habit_analysis/run", headers=headers_a)
    snap_a = _request(app, "GET", "/api/v1/assistant/snapshot", headers=headers_a).json()
    assert snap_a["habit_candidate"] is not None
    habit_trigger = next(
        t for t in snap_a["active_triggers"] if t["kind"] == "habit_suggestion"
    )
    trigger_id = habit_trigger["id"]

    # Student B cannot dismiss Student A's trigger
    cross = _request(
        app,
        "POST",
        f"/api/v1/assistant/triggers/{trigger_id}/dismiss",
        headers=headers_b,
    )
    assert cross.status_code == 404
    assert cross.json()["error"]["code"] == "TRIGGER_NOT_FOUND"

    # Student A dismisses -> returns 7-day cooldown_until
    dismiss = _request(
        app,
        "POST",
        f"/api/v1/assistant/triggers/{trigger_id}/dismiss",
        headers=headers_a,
    )
    assert dismiss.status_code == 200
    assert dismiss.json() == {
        "trigger_id": trigger_id,
        "status": "dismissed",
        "cooldown_until": "2026-12-05",
    }

    # Next day, habit_analysis is suppressed by the 7-day cooldown
    clock.current_utc = dt.datetime(2026, 11, 29, 1, 0, tzinfo=dt.timezone.utc)
    next_day_run = _request(app, "POST", "/api/v1/jobs/habit_analysis/run", headers=headers_a)
    assert next_day_run.status_code == 200
    assert next_day_run.json()["status"] == "skipped_no_action"
    assert next_day_run.json()["triggers_emitted"] == 0


def test_ready_endpoint_reports_posture_without_leaking_secrets():
    secret_val = "super-secret-cron-token-999"
    app_jwt = create_app(
        auth_config=_auth_config(),
        repository=InMemoryRepository(),
        scheduler_settings=SchedulerSettings(
            enabled=False,
            scheduler_secret=SecretStr(secret_val),
        ),
    )
    res_jwt = _request(app_jwt, "GET", "/ready")
    assert res_jwt.status_code == 200
    body = res_jwt.json()
    assert body["status"] == "ready"
    assert body["service"] == "carenta-api"
    assert body["auth_mode"] == "supabase_jwt"
    assert body["scheduler_enabled"] is False
    assert body["scheduler_running"] is False
    assert body["insight_provider"] == "deterministic_fallback"
    assert secret_val not in res_jwt.text
    assert TEST_SECRET not in res_jwt.text

    app_unconfigured = create_app(
        auth_config=AuthConfig(local_dev_auth=False),
        repository=InMemoryRepository(),
    )
    res_unconf = _request(app_unconfigured, "GET", "/ready")
    assert res_unconf.status_code == 200
    assert res_unconf.json()["status"] == "degraded"
    assert res_unconf.json()["auth_mode"] == "fail_closed_unconfigured"
