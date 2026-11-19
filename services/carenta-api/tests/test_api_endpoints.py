"""Integration tests for FastAPI REST endpoints (Issue #43 Acceptance Criteria).

Verifies:
- GET /api/v1/transactions and POST /api/v1/transactions
- GET /api/v1/budget/summary (Safe-to-Spend & Recovery)
- GET /api/v1/goals and POST /api/v1/goals
- Idempotency key protection
- Dual routing support (/api/v1 and /v1)
"""

import asyncio
from datetime import date
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


def test_transaction_crud_and_idempotency():
    # 1. Initially empty
    res = client_request("GET", "/api/v1/transactions")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 0
    assert data["items"] == []

    # 2. Create transaction
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
    assert "id" in created_tx

    # 3. Test idempotency: sending same idempotency_key returns identical record without duplicate
    dup_res = client_request("POST", "/api/v1/transactions", json=payload)
    assert dup_res.status_code == 201
    assert dup_res.json()["id"] == created_tx["id"]

    # Total should still be 1
    list_res = client_request("GET", "/api/v1/transactions")
    assert list_res.json()["total"] == 1

    # 4. Create an income transaction
    income_payload = {
        "amount": 2000000,
        "kind": "income",
        "category": "Tiền trợ cấp",
        "date": "2026-11-19",
        "note": "Ba mẹ gửi",
    }
    client_request("POST", "/api/v1/transactions", json=income_payload)

    # 5. Check totals
    summary_list = client_request("GET", "/api/v1/transactions").json()
    assert summary_list["total"] == 2
    assert summary_list["total_income"] == 2000000
    assert summary_list["total_expense"] == 50000


def test_dual_routing_support():
    """Verify endpoints are accessible under both /api/v1 and /v1 prefixes."""
    payload = {
        "amount": 35000,
        "kind": "expense",
        "category": "Đồ uống",
        "date": "2026-11-19",
        "note": "Cà phê",
    }
    post_res = client_request("POST", "/v1/transactions", json=payload)
    assert post_res.status_code == 201

    get_api = client_request("GET", "/api/v1/transactions")
    get_v1 = client_request("GET", "/v1/transactions")
    assert get_api.status_code == 200
    assert get_v1.status_code == 200
    assert get_api.json()["total"] == 1
    assert get_v1.json()["total"] == 1


def test_budget_summary_endpoint():
    # Setup initial budget state:
    # Opening cash = 3,000,000
    # Unpaid commitments = 1,000,000 (rent)
    # Savings reserved = 500,000
    # Safe to spend = 1,500,000 across 15 days -> 100,000 / day
    client_request("POST", "/api/v1/budget/config", json={
        "opening_balance": 3000000,
        "unpaid_commitments": 1000000,
        "savings_reserved": 500000,
        "planning_days_remaining": 15,
    })

    # Before spending today
    res = client_request("GET", "/api/v1/budget/summary", params={"today": "2026-11-19"})
    assert res.status_code == 200
    data = res.json()
    assert data["cash"] == 3000000
    assert data["protected"] == 1500000
    assert data["safe_to_spend"] == 1500000
    assert data["funding_shortfall"] == 0
    assert data["daily_budget"] == 100000
    assert data["spent_today"] == 0
    assert data["remaining_today"] == 100000
    assert data["is_overspent_today"] is False

    # Add an overspending expense today: 160,000 VND
    client_request("POST", "/api/v1/transactions", json={
        "amount": 160000,
        "kind": "expense",
        "category": "Mua sắm",
        "date": "2026-11-19",
        "note": "Sách vở",
    })

    # After overspending:
    res2 = client_request("GET", "/api/v1/budget/summary", params={"today": "2026-11-19"})
    assert res2.status_code == 200
    data2 = res2.json()
    assert data2["cash"] == 2840000
    assert data2["spent_today"] == 160000
    assert data2["remaining_today"] == -60000
    assert data2["is_overspent_today"] is True
    assert data2["overspent_amount_today"] == 60000
    # Dynamic budget recovery: remaining safe to spend = 1,340,000 over 14 subsequent days = 95,714 VND/day
    assert data2["subsequent_daily_budget"] == 95714


def test_saving_goals_endpoint():
    # 1. No goals initially
    res_list = client_request("GET", "/api/v1/goals")
    assert res_list.status_code == 200
    assert res_list.json() == []

    # 2. Create goal matching plan golden fixture
    goal_payload = {
        "title": "Mua laptop mới",
        "target_amount": 2000000,
        "deadline": "2026-08-11",
        "initial_allocated": 1250000,
    }
    create_res = client_request("POST", "/api/v1/goals", json=goal_payload, params={"today": "2026-07-12"})
    assert create_res.status_code == 201
    goal = create_res.json()
    assert goal["title"] == "Mua laptop mới"
    assert goal["target_amount"] == 2000000
    assert goal["allocated_amount"] == 1250000
    assert goal["remaining_target"] == 750000
    assert goal["saving_days"] == 30
    assert goal["suggested_daily_saving"] == 25000
    assert goal["is_completed"] is False

    # 3. Retrieve single active goal
    get_res = client_request("GET", "/api/v1/goal", params={"today": "2026-07-12"})
    assert get_res.status_code == 200
    assert get_res.json()["id"] == goal["id"]
