"""ASGI integration tests for authentication and per-Student Identity scoping (#81)."""

from __future__ import annotations

import asyncio
import datetime as dt

import httpx
import jwt
import pytest

from app.auth import AuthConfig
from app.main import create_app
from app.repository import InMemoryRepository, repository as default_repository

TEST_SECRET = "test-hmac-secret-at-least-32-bytes-long"
TEST_ISSUER = "https://proj.supabase.co/auth/v1"


def _make_token(
    sub: str = "student-a",
    secret: str = TEST_SECRET,
    aud: str = "authenticated",
    delta_seconds: int = 3600,
) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    claims = {
        "sub": sub,
        "email": f"{sub}@hcmus.edu.vn",
        "role": "authenticated",
        "aud": aud,
        "iss": TEST_ISSUER,
        "iat": int(now.timestamp()),
        "exp": int((now + dt.timedelta(seconds=delta_seconds)).timestamp()),
    }
    return jwt.encode(claims, secret, algorithm="HS256")


def _request(
    app,
    method: str,
    path: str,
    *,
    json: dict | None = None,
    params: dict | None = None,
    headers: dict[str, str] | None = None,
):
    async def run():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, path, json=json, params=params, headers=headers)

    return asyncio.run(run())


def _fail_closed_app(repo: InMemoryRepository | None = None):
    config = AuthConfig(
        supabase_url="https://proj.supabase.co",
        jwt_secret=TEST_SECRET,
        local_dev_auth=False,
    )
    return create_app(auth_config=config, repository=repo or InMemoryRepository())


_BASE_FINANCIAL_ROUTES = [
    ("GET", "/transactions", None),
    (
        "POST",
        "/transactions",
        {
            "amount": 50000,
            "kind": "expense",
            "category": "food",
            "date": "2026-11-25",
            "idempotency_key": "idem-unauth-001",
        },
    ),
    ("GET", "/transactions/tx-1", None),
    ("GET", "/budget/summary", None),
    ("POST", "/budget/config", {"opening_balance": 100000}),
    ("GET", "/goals", None),
    (
        "POST",
        "/goals",
        {"title": "Emergency", "target_amount": 1000000, "deadline": "2026-12-31"},
    ),
    ("GET", "/goal", None),
    (
        "POST",
        "/goal",
        {"title": "Emergency", "target_amount": 1000000, "deadline": "2026-12-31"},
    ),
    ("PATCH", "/goal", {"title": "Updated"}),
    ("POST", "/goal/allocate", {"amount": 10000}),
]

FINANCIAL_ROUTES = [
    (method, f"{prefix}{suffix}", payload)
    for prefix in ("/api/v1", "/v1")
    for (method, suffix, payload) in _BASE_FINANCIAL_ROUTES
]


@pytest.mark.parametrize(("method", "path", "payload"), FINANCIAL_ROUTES)
def test_financial_routes_fail_closed_without_bearer_token(
    method: str, path: str, payload: dict | None
):
    app = _fail_closed_app()
    res = _request(
        app,
        method,
        path,
        json=payload,
        headers={"X-Request-ID": "req-missing-auth"},
    )
    assert res.status_code == 401
    assert res.json() == {
        "error": {
            "code": "AUTH_REQUIRED",
            "message": "Authentication required.",
            "request_id": "req-missing-auth",
        }
    }


def test_default_create_app_fails_closed_under_empty_env(monkeypatch: pytest.MonkeyPatch):
    for key in ("SUPABASE_URL", "SUPABASE_JWT_SECRET", "CARENTA_LOCAL_DEV_AUTH"):
        monkeypatch.delenv(key, raising=False)
    app = create_app()
    res = _request(app, "GET", "/api/v1/transactions")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "AUTH_REQUIRED"


def test_financial_routes_reject_expired_or_invalid_jwt_and_keep_health_public():
    app = _fail_closed_app()

    health_res = _request(app, "GET", "/health")
    assert health_res.status_code == 200
    assert health_res.json() == {"status": "ok", "service": "carenta-api"}

    expired_token = _make_token(delta_seconds=-60)
    expired_res = _request(
        app,
        "GET",
        "/api/v1/budget/summary",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert expired_res.status_code == 401
    assert expired_res.json()["error"]["code"] == "AUTH_TOKEN_EXPIRED"

    bad_sig_token = _make_token(secret="wrong-secret-at-least-32-bytes-long-123")
    bad_sig_res = _request(
        app,
        "POST",
        "/v1/budget/config",
        json={"opening_balance": 100000},
        headers={"Authorization": f"Bearer {bad_sig_token}"},
    )
    assert bad_sig_res.status_code == 401
    assert bad_sig_res.json()["error"]["code"] == "AUTH_INVALID_TOKEN"

    wrong_aud_token = _make_token(aud="other-app")
    bad_aud_res = _request(
        app,
        "GET",
        "/api/v1/transactions",
        headers={"Authorization": f"Bearer {wrong_aud_token}"},
    )
    assert bad_aud_res.status_code == 401
    assert bad_aud_res.json()["error"]["code"] == "AUTH_INVALID_TOKEN"


def test_local_dev_auth_allows_financial_routes_but_rejects_malformed_bearer():
    repo = InMemoryRepository()
    app = create_app(
        auth_config=AuthConfig(local_dev_auth=True, local_dev_user_id="dev-student-1"),
        repository=repo,
    )

    cfg_res = _request(app, "POST", "/api/v1/budget/config", json={"opening_balance": 500000})
    assert cfg_res.status_code == 200

    summary_res = _request(app, "GET", "/api/v1/budget/summary")
    assert summary_res.status_code == 200
    assert summary_res.json()["cash"] == 500000

    bad_res = _request(
        app,
        "GET",
        "/api/v1/transactions",
        headers={"Authorization": "Bearer invalid.jwt.here"},
    )
    assert bad_res.status_code == 401
    assert bad_res.json()["error"]["code"] == "AUTH_INVALID_TOKEN"


def test_transactions_and_idempotency_keys_are_isolated_per_student_identity():
    app = _fail_closed_app()
    headers_a = {"Authorization": f"Bearer {_make_token('student-a')}"}
    headers_b = {"Authorization": f"Bearer {_make_token('student-b')}"}

    tx_a_res = _request(
        app,
        "POST",
        "/api/v1/transactions",
        json={
            "amount": 50000,
            "kind": "expense",
            "category": "food",
            "date": "2026-11-25",
            "note": "Bun bo",
            "idempotency_key": "shared-idem-0001",
        },
        headers=headers_a,
    )
    assert tx_a_res.status_code == 201
    tx_a_id = tx_a_res.json()["id"]

    # Student B must NOT see Student A's transactions
    list_b = _request(app, "GET", "/api/v1/transactions", headers=headers_b)
    assert list_b.status_code == 200
    assert list_b.json() == {
        "items": [],
        "total": 0,
        "total_income": 0,
        "total_expense": 0,
    }

    # Cross-student lookup hides existence via 404 NOT_FOUND on both prefixes
    for path in (f"/api/v1/transactions/{tx_a_id}", f"/v1/transactions/{tx_a_id}"):
        missing_res = _request(app, "GET", path, headers=headers_b)
        assert missing_res.status_code == 404
        assert missing_res.json()["error"]["code"] == "NOT_FOUND"

    # Reusing the same idempotency_key across different students must succeed (scoped by user_id)
    tx_b_res = _request(
        app,
        "POST",
        "/api/v1/transactions",
        json={
            "amount": 99000,
            "kind": "expense",
            "category": "drink",
            "date": "2026-11-25",
            "note": "Tra sua",
            "idempotency_key": "shared-idem-0001",
        },
        headers=headers_b,
    )
    assert tx_b_res.status_code == 201
    assert tx_b_res.json()["id"] != tx_a_id
    assert _request(app, "GET", "/api/v1/transactions", headers=headers_b).json()["total"] == 1
    assert _request(app, "GET", "/api/v1/transactions", headers=headers_a).json()["total"] == 1

    # Same student reusing idempotency_key with a mismatched payload still hits 409 CONFLICT
    conflict_a = _request(
        app,
        "POST",
        "/api/v1/transactions",
        json={
            "amount": 77000,
            "kind": "expense",
            "category": "food",
            "date": "2026-11-25",
            "note": "Bun bo",
            "idempotency_key": "shared-idem-0001",
        },
        headers=headers_a,
    )
    assert conflict_a.status_code == 409
    assert conflict_a.json()["error"]["code"] == "CONFLICT"


def test_budget_and_savings_goals_are_isolated_per_student_identity():
    app = _fail_closed_app()
    headers_a = {"Authorization": f"Bearer {_make_token('student-a')}"}
    headers_b = {"Authorization": f"Bearer {_make_token('student-b')}"}

    cfg_a = _request(
        app,
        "POST",
        "/api/v1/budget/config",
        json={
            "opening_balance": 1_000_000,
            "unpaid_commitments": 200_000,
            "savings_reserved": 100_000,
        },
        headers=headers_a,
    )
    assert cfg_a.status_code == 200

    exp_a = _request(
        app,
        "POST",
        "/api/v1/transactions",
        json={
            "amount": 150_000,
            "kind": "expense",
            "category": "food",
            "date": "2026-11-25",
            "idempotency_key": "idem-a-exp-1",
        },
        headers=headers_a,
    )
    assert exp_a.status_code == 201

    goal_a = _request(
        app,
        "POST",
        "/api/v1/goal",
        json={"title": "Laptop A", "target_amount": 5_000_000, "deadline": "2026-12-31"},
        headers=headers_a,
    )
    assert goal_a.status_code == 201

    upd_a = _request(
        app,
        "PATCH",
        "/api/v1/goal",
        json={"target_amount": 6_000_000},
        headers=headers_a,
    )
    assert upd_a.status_code == 200
    assert upd_a.json()["target_amount"] == 6_000_000

    alloc_a = _request(
        app,
        "POST",
        "/api/v1/goal/allocate",
        json={"amount": 150_000},
        headers=headers_a,
    )
    assert alloc_a.status_code == 200
    assert alloc_a.json()["allocated_amount"] == 150_000

    # Student B has clean zeroed budget state and zero access to Student A's active goal
    summary_b = _request(app, "GET", "/api/v1/budget/summary", headers=headers_b)
    assert summary_b.status_code == 200
    assert summary_b.json()["cash"] == 0
    assert summary_b.json()["total_income"] == 0
    assert summary_b.json()["total_expense"] == 0
    assert summary_b.json()["unpaid_commitments"] == 0
    assert summary_b.json()["savings_allocated"] == 0
    assert summary_b.json()["savings_reserved"] == 0
    assert summary_b.json()["safe_to_spend"] == 0

    assert _request(app, "GET", "/api/v1/goal", headers=headers_b).status_code == 404
    assert _request(app, "GET", "/api/v1/goals", headers=headers_b).json() == []
    assert (
        _request(
            app,
            "PATCH",
            "/api/v1/goal",
            json={"title": "Hijacked"},
            headers=headers_b,
        ).status_code
        == 404
    )
    assert (
        _request(
            app,
            "POST",
            "/api/v1/goal/allocate",
            json={"amount": 50_000},
            headers=headers_b,
        ).status_code
        == 404
    )

    # Student B can create and fund their own active goal independently without affecting Student A
    goal_b = _request(
        app,
        "POST",
        "/api/v1/goals",
        json={"title": "Phone B", "target_amount": 2_000_000, "deadline": "2026-12-31"},
        headers=headers_b,
    )
    assert goal_b.status_code == 201
    alloc_b = _request(
        app,
        "POST",
        "/api/v1/goal/allocate",
        json={"amount": 50_000},
        headers=headers_b,
    )
    assert alloc_b.status_code == 200
    assert alloc_b.json()["allocated_amount"] == 50_000

    # Student A's goal, goals list, and budget summary stay completely isolated
    check_a_goal = _request(app, "GET", "/v1/goal", headers=headers_a)
    assert check_a_goal.status_code == 200
    assert check_a_goal.json()["title"] == "Laptop A"
    assert check_a_goal.json()["allocated_amount"] == 150_000
    assert len(_request(app, "GET", "/api/v1/goals", headers=headers_a).json()) == 1

    check_a_summary = _request(app, "GET", "/v1/budget/summary", headers=headers_a)
    assert check_a_summary.status_code == 200
    assert check_a_summary.json()["cash"] == 850_000
    assert check_a_summary.json()["savings_allocated"] == 150_000
    assert check_a_summary.json()["savings_reserved"] == 0


def test_injected_repository_isolates_app_instances_from_default_repository():
    default_repository.reset()
    try:
        isolated_repo = InMemoryRepository()
        app1 = _fail_closed_app(repo=isolated_repo)
        app2 = create_app(
            auth_config=AuthConfig(
                supabase_url="https://proj.supabase.co",
                jwt_secret=TEST_SECRET,
                local_dev_auth=False,
            )
        )
        headers_a = {"Authorization": f"Bearer {_make_token('student-a')}"}

        cfg_res = _request(
            app1,
            "POST",
            "/api/v1/budget/config",
            json={"opening_balance": 750_000},
            headers=headers_a,
        )
        assert cfg_res.status_code == 200

        assert _request(app1, "GET", "/api/v1/budget/summary", headers=headers_a).json()["cash"] == 750_000
        assert _request(app2, "GET", "/api/v1/budget/summary", headers=headers_a).json()["cash"] == 0
    finally:
        default_repository.reset()
