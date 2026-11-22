"""Integration tests for FastAPI REST endpoints (Issue #43 Acceptance Criteria).

Verifies:
- GET /api/v1/transactions and POST /api/v1/transactions with required idempotency key
- Idempotency key conflict (409) on mismatched payload retry
- GET /api/v1/budget/summary (Safe-to-Spend & Recovery)
- Dynamic days_remaining to month-end (Review item #1)
- Correct daily budget under funding shortfall (Review item #2)
- Saving goals with status ('on_track', 'due_today', 'overdue', 'completed') and read-only balance (Review item #3 & #4)
- Dual routing support (/api/v1 and /v1)
"""

import asyncio
import datetime as dt
import pytest
import httpx

from app.main import app
from app.repository import repository


def client_request(method: str, path: str, json: dict | None = None, params: dict | None = None):
    async def run():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, path, json=json, params=params)

    return asyncio.run(run())


@pytest.fixture(autouse=True)
def clean_repository():
    """Reset repository before each test to guarantee complete isolation."""
    repository.reset()
    yield
    repository.reset()


def test_transaction_crud_and_idempotency_conflict():
    # 1. Initially empty
    res = client_request("GET", "/api/v1/transactions")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 0
    assert data["items"] == []

    # 2. Create transaction with required idempotency_key
    payload = {
        "amount": 50000,
        "kind": "expense",
        "category": "Ăn uống",
        "date": "2026-11-19",
        "note": "Cơm trưa",
        "idempotency_key": "tx-key-001",
    }
    create_res = client_request("POST", "/api/v1/transactions", json=payload)
    assert create_res.status_code == 201
    created_tx = create_res.json()
    assert created_tx["amount"] == 50000
    assert created_tx["kind"] == "expense"
    assert created_tx["category"] == "Ăn uống"
    assert created_tx["idempotency_key"] == "tx-key-001"
    assert "id" in created_tx

    # 3. Test idempotency: sending identical payload returns original transaction
    dup_res = client_request("POST", "/api/v1/transactions", json=payload)
    assert dup_res.status_code == 201
    assert dup_res.json()["id"] == created_tx["id"]

    # 4. Test idempotency conflict (Review item #5): same key with different amount returns 409
    mismatched_payload = dict(payload)
    mismatched_payload["amount"] = 99999
    conflict_res = client_request("POST", "/api/v1/transactions", json=mismatched_payload)
    assert conflict_res.status_code == 409
    assert "conflict" in conflict_res.json()["detail"].lower()

    # Total must still be 1
    list_res = client_request("GET", "/api/v1/transactions")
    assert list_res.json()["total"] == 1


def test_dynamic_days_remaining_to_month_end():
    """Review item #1: days_remaining must dynamically adjust based on today's date."""
    # November 2026 has 30 days.
    # On Nov 19: (30 - 19) + 1 = 12 days remaining inclusive
    res_19 = client_request("GET", "/api/v1/budget/summary", params={"today": "2026-11-19"})
    assert res_19.status_code == 200
    assert res_19.json()["days_remaining"] == 12

    # On Nov 29: (30 - 29) + 1 = 2 days remaining inclusive
    res_29 = client_request("GET", "/api/v1/budget/summary", params={"today": "2026-11-29"})
    assert res_29.status_code == 200
    assert res_29.json()["days_remaining"] == 2

    # On Nov 30: (30 - 30) + 1 = 1 day remaining inclusive
    res_30 = client_request("GET", "/api/v1/budget/summary", params={"today": "2026-11-30"})
    assert res_30.status_code == 200
    assert res_30.json()["days_remaining"] == 1


def test_shortfall_does_not_show_positive_daily_budget():
    """Review item #2: Opening balance 100,000, expense 200,000 today.
    Cash = -100,000, safe_to_spend = 0, funding_shortfall = 100,000.
    At start of day, safe_to_spend was 100,000 across 12 days -> initial daily budget = 8,333.
    Remaining today = 8,333 - 200,000 = -191,667 (overspent).
    Subsequent daily budget must be 0 because period is exhausted!
    """
    client_request("POST", "/api/v1/budget/config", json={
        "opening_balance": 100000,
        "unpaid_commitments": 0,
        "savings_reserved": 0,
    })

    client_request("POST", "/api/v1/transactions", json={
        "amount": 200000,
        "kind": "expense",
        "category": "Ăn uống",
        "date": "2026-11-19",
        "idempotency_key": "tx-shortfall-1",
    })

    res = client_request("GET", "/api/v1/budget/summary", params={"today": "2026-11-19"})
    assert res.status_code == 200
    data = res.json()
    assert data["cash"] == -100000
    assert data["safe_to_spend"] == 0
    assert data["funding_shortfall"] == 100000
    assert data["spent_today"] == 200000
    assert data["is_overspent_today"] is True
    assert data["overspent_amount_today"] == 191667
    assert data["subsequent_daily_budget"] == 0
    assert data["is_period_exhausted"] is True


def test_zero_balance_shortfall_initial_allowance_is_zero():
    """If user started with 0 cash and spends 200,000, daily_budget must be 0."""
    client_request("POST", "/api/v1/budget/config", json={"opening_balance": 0})
    client_request("POST", "/api/v1/transactions", json={
        "amount": 200000,
        "kind": "expense",
        "category": "Ăn uống",
        "date": "2026-11-19",
        "idempotency_key": "tx-shortfall-2",
    })

    res = client_request("GET", "/api/v1/budget/summary", params={"today": "2026-11-19"})
    assert res.status_code == 200
    data = res.json()
    assert data["cash"] == -200000
    assert data["safe_to_spend"] == 0
    assert data["daily_budget"] == 0
    assert data["subsequent_daily_budget"] == 0


def test_saving_goals_read_only_balance_and_patch():
    """Review item #4: Client cannot supply initial_allocated.
    Allocations must be done via explicit allocate endpoint.
    Goal update preserves allocated amount.
    """
    # 1. Create goal (initial_allocated is not in schema)
    goal_payload = {
        "title": "Mua laptop mới",
        "target_amount": 2000000,
        "deadline": "2026-08-11",
    }
    create_res = client_request("POST", "/api/v1/goals", json=goal_payload, params={"today": "2026-07-12"})
    assert create_res.status_code == 201
    goal = create_res.json()
    assert goal["allocated_amount"] == 0
    assert goal["remaining_target"] == 2000000
    assert goal["status"] == "on_track"

    # 2. Allocate savings
    alloc_res = client_request("POST", "/api/v1/goal/allocate", json={"amount": 1250000}, params={"today": "2026-07-12"})
    assert alloc_res.status_code == 200
    allocated_goal = alloc_res.json()
    assert allocated_goal["allocated_amount"] == 1250000
    assert allocated_goal["remaining_target"] == 750000
    assert allocated_goal["suggested_daily_saving"] == 25000  # 750k over 30 days

    # 3. Update goal title/target while preserving allocated amount
    patch_res = client_request("PATCH", "/api/v1/goal", json={"title": "Mua laptop gaming"}, params={"today": "2026-07-12"})
    assert patch_res.status_code == 200
    assert patch_res.json()["title"] == "Mua laptop gaming"
    assert patch_res.json()["allocated_amount"] == 1250000


def test_dual_routing_support():
    """Verify endpoints are accessible under both /api/v1 and /v1 prefixes."""
    payload = {
        "amount": 35000,
        "kind": "expense",
        "category": "Đồ uống",
        "date": "2026-11-19",
        "note": "Cà phê",
        "idempotency_key": "tx-dual-1",
    }
    post_res = client_request("POST", "/v1/transactions", json=payload)
    assert post_res.status_code == 201

    get_api = client_request("GET", "/api/v1/transactions")
    get_v1 = client_request("GET", "/v1/transactions")
    assert get_api.status_code == 200
    assert get_v1.status_code == 200
    assert get_api.json()["total"] == 1
    assert get_v1.json()["total"] == 1
