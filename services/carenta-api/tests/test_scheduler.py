"""ASGI tests for the in-process background scheduler and job trigger API (#118)."""

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
from app.settings import SchedulerSettings, load_scheduler_settings

TEST_SECRET = "test-hmac-secret-at-least-32-bytes-long"
TEST_ISSUER = "https://proj.supabase.co/auth/v1"
SCHEDULER_SECRET = "scheduler-cron-secret-value-001"
VN_TZ = dt.timezone(dt.timedelta(hours=7))


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


@dataclass
class _MutableClock:
    current_utc: dt.datetime

    def __call__(self) -> dt.datetime:
        return self.current_utc


def _auth_config() -> AuthConfig:
    return AuthConfig(
        supabase_url="https://proj.supabase.co",
        jwt_secret=TEST_SECRET,
        local_dev_auth=False,
    )


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


def test_load_scheduler_settings_defaults_and_secret_wrapping():
    defaults = load_scheduler_settings({})
    assert defaults.enabled is False
    assert defaults.poll_interval_seconds == 60.0
    assert defaults.evening_reminder_time == dt.time(20, 0)
    assert defaults.habit_analysis_time == dt.time(7, 30)
    assert defaults.scheduler_secret is None

    loaded = load_scheduler_settings(
        {
            "CARENTA_SCHEDULER_ENABLED": "true",
            "CARENTA_SCHEDULER_POLL_SECONDS": "15",
            "CARENTA_EVENING_REMINDER_TIME": "20:15",
            "CARENTA_HABIT_ANALYSIS_TIME": "08:00",
            "CARENTA_SCHEDULER_SECRET": "top-secret-scheduler-token",
        }
    )
    assert loaded.enabled is True
    assert loaded.poll_interval_seconds == 15.0
    assert loaded.evening_reminder_time == dt.time(20, 15)
    assert loaded.habit_analysis_time == dt.time(8, 0)
    assert loaded.scheduler_secret is not None
    assert loaded.scheduler_secret.get_secret_value() == "top-secret-scheduler-token"
    assert "top-secret-scheduler-token" not in repr(loaded)

    with pytest.raises(ValueError, match="CARENTA_EVENING_REMINDER_TIME"):
        load_scheduler_settings({"CARENTA_EVENING_REMINDER_TIME": "25:99"})


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/api/v1/jobs/evening_reminder/run"),
        ("GET", "/api/v1/jobs/status"),
        ("POST", "/v1/jobs/habit_analysis/run"),
        ("GET", "/v1/jobs/status"),
    ],
)
def test_user_job_endpoints_fail_closed_without_auth(method: str, path: str):
    app = create_app(auth_config=_auth_config(), repository=InMemoryRepository())
    res = _request(app, method, path)
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "AUTH_REQUIRED"


@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/internal/jobs/evening_reminder/run",
        "/v1/internal/jobs/habit_analysis/run",
    ],
)
def test_internal_job_endpoint_fails_closed_without_or_wrong_secret(path: str):
    unconfigured = create_app(
        auth_config=_auth_config(),
        repository=InMemoryRepository(),
        scheduler_settings=SchedulerSettings(scheduler_secret=None),
    )
    res_unconfigured = _request(unconfigured, "POST", path)
    assert res_unconfigured.status_code == 503
    assert res_unconfigured.json()["error"]["code"] == "SCHEDULER_SECRET_UNCONFIGURED"

    configured = create_app(
        auth_config=_auth_config(),
        repository=InMemoryRepository(),
        scheduler_settings=SchedulerSettings(scheduler_secret=SecretStr(SCHEDULER_SECRET)),
    )
    res_missing = _request(configured, "POST", path)
    assert res_missing.status_code == 403
    assert res_missing.json()["error"]["code"] == "SCHEDULER_FORBIDDEN"

    res_wrong = _request(
        configured,
        "POST",
        path,
        headers={"X-Scheduler-Secret": "wrong-secret"},
    )
    assert res_wrong.status_code == 403
    assert res_wrong.json()["error"]["code"] == "SCHEDULER_FORBIDDEN"


def test_evening_reminder_deduplication_and_vn_timezone_boundary():
    # 2026-11-28 20:05 Asia/Ho_Chi_Minh == 13:05 UTC
    clock = _MutableClock(dt.datetime(2026, 11, 28, 13, 5, tzinfo=dt.timezone.utc))
    repo = InMemoryRepository()
    app = create_app(
        auth_config=_auth_config(),
        repository=repo,
        clock=clock,
        scheduler_settings=SchedulerSettings(scheduler_secret=SecretStr(SCHEDULER_SECRET)),
    )
    headers_a = {"Authorization": f"Bearer {_make_token('student-a')}"}
    headers_b = {"Authorization": f"Bearer {_make_token('student-b')}"}

    # Student A has 0 expenses -> fires once
    first = _request(app, "POST", "/api/v1/jobs/evening_reminder/run", headers=headers_a)
    assert first.status_code == 200
    assert first.json()["job_name"] == "evening_reminder"
    assert first.json()["local_date"] == "2026-11-28"
    assert first.json()["status"] == "executed"
    assert first.json()["triggers_emitted"] == 1
    assert first.json()["owners_evaluated"] == 1

    # Re-running on same local date is deduplicated
    repeat = _request(app, "POST", "/v1/jobs/evening_reminder/run", headers=headers_a)
    assert repeat.status_code == 200
    assert repeat.json()["status"] == "deduplicated"
    assert repeat.json()["triggers_emitted"] == 0

    # Student B has already logged an expense today -> skipped_no_action
    tx_res = _request(
        app,
        "POST",
        "/api/v1/transactions",
        headers=headers_b,
        json={
            "amount": 35000,
            "kind": "expense",
            "category": "food",
            "date": "2026-11-28",
            "note": "Com tam",
            "idempotency_key": "tx-b-1",
        },
    )
    assert tx_res.status_code == 201

    b_run = _request(app, "POST", "/api/v1/jobs/evening_reminder/run", headers=headers_b)
    assert b_run.status_code == 200
    assert b_run.json()["status"] == "skipped_no_action"
    assert b_run.json()["triggers_emitted"] == 0

    # Student A status only shows Student A's run
    status_a = _request(app, "GET", "/api/v1/jobs/status", headers=headers_a)
    assert status_a.status_code == 200
    assert status_a.json()["timezone"] == "Asia/Ho_Chi_Minh"
    evening_summary = next(
        j for j in status_a.json()["jobs"] if j["job_name"] == "evening_reminder"
    )
    assert evening_summary["last_run_date"] == "2026-11-28"
    assert evening_summary["last_status"] == "executed"

    # Advance clock to 2026-11-29 20:05 VN (13:05 UTC) -> executes for the new local date
    clock.current_utc = dt.datetime(2026, 11, 29, 13, 5, tzinfo=dt.timezone.utc)
    next_day = _request(app, "POST", "/api/v1/jobs/evening_reminder/run", headers=headers_a)
    assert next_day.status_code == 200
    assert next_day.json()["local_date"] == "2026-11-29"
    assert next_day.json()["status"] == "executed"
    assert next_day.json()["triggers_emitted"] == 1


def test_habit_analysis_and_internal_sweep_emit_non_mutating_triggers():
    clock = _MutableClock(dt.datetime(2026, 11, 28, 0, 35, tzinfo=dt.timezone.utc))  # 07:35 VN
    repo = InMemoryRepository()
    app = create_app(
        auth_config=_auth_config(),
        repository=repo,
        clock=clock,
        scheduler_settings=SchedulerSettings(scheduler_secret=SecretStr(SCHEDULER_SECRET)),
    )
    headers_a = {"Authorization": f"Bearer {_make_token('student-a')}"}
    headers_b = {"Authorization": f"Bearer {_make_token('student-b')}"}

    # Seed 5 recurring days for student-a (Nov 23..27) and 1 unrelated expense for student-b
    for day_offset in range(1, 6):
        res = _request(
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
                "idempotency_key": f"habit-a-{day_offset}",
            },
        )
        assert res.status_code == 201

    res_b = _request(
        app,
        "POST",
        "/api/v1/transactions",
        headers=headers_b,
        json={
            "amount": 50000,
            "kind": "expense",
            "category": "transport",
            "date": "2026-11-27",
            "note": "Grab",
            "idempotency_key": "habit-b-1",
        },
    )
    assert res_b.status_code == 201

    sweep = _request(
        app,
        "POST",
        "/api/v1/internal/jobs/habit_analysis/run",
        headers={"X-Scheduler-Secret": SCHEDULER_SECRET},
    )
    assert sweep.status_code == 200
    body = sweep.json()
    assert body["job_name"] == "habit_analysis"
    assert body["local_date"] == "2026-11-28"
    assert body["status"] == "executed"
    assert body["owners_evaluated"] == 2
    assert body["triggers_emitted"] == 1

    # Non-mutation invariant: transaction counts remain untouched
    assert _request(app, "GET", "/api/v1/transactions", headers=headers_a).json()["total"] == 5
    assert _request(app, "GET", "/api/v1/transactions", headers=headers_b).json()["total"] == 1

    # Repeated internal sweep same day is deduplicated
    sweep_again = _request(
        app,
        "POST",
        "/v1/internal/jobs/habit_analysis/run",
        headers={"X-Scheduler-Secret": SCHEDULER_SECRET},
    )
    assert sweep_again.status_code == 200
    assert sweep_again.json()["status"] == "deduplicated"
    assert sweep_again.json()["triggers_emitted"] == 0


def test_lifespan_starts_and_stops_scheduler_when_enabled():
    clock = _MutableClock(dt.datetime(2026, 11, 28, 13, 5, tzinfo=dt.timezone.utc))  # 20:05 VN
    repo = InMemoryRepository()
    app = create_app(
        auth_config=_auth_config(),
        repository=repo,
        clock=clock,
        scheduler_settings=SchedulerSettings(enabled=True, poll_interval_seconds=0.05),
    )

    async def exercise():
        headers = {"Authorization": f"Bearer {_make_token('student-a')}"}
        transport = httpx.ASGITransport(app=app)
        async with app.router.lifespan_context(app):
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                res = await client.get("/api/v1/jobs/status", headers=headers)
                assert res.status_code == 200
                assert res.json()["scheduler_enabled"] is True
                assert res.json()["scheduler_running"] is True
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            res_after = await client.get("/api/v1/jobs/status", headers=headers)
            assert res_after.status_code == 200
            assert res_after.json()["scheduler_running"] is False

    asyncio.run(exercise())
