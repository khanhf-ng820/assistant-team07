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
import pytest
import httpx

from app.auth import AuthConfig
from app.main import create_app
from app.repository import repository

# Functional CRUD/engine tests opt into explicit Local Dev Mode while default create_app() fails closed.
app = create_app(auth_config=AuthConfig(local_dev_auth=True))


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
    conflict_body = conflict_res.json()
    assert conflict_body["error"]["code"] == "CONFLICT"
    assert "conflict" in conflict_body["error"]["message"].lower()
    assert isinstance(conflict_body["error"]["request_id"], str) and conflict_body["error"]["request_id"]

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


TODAY = {"today": "2026-11-16"}  # 15 days remaining inclusive (16..30 Nov)


def _setup_plan_section7_example():
    """Plan §7: cash 3,000,000, rent 1,000,000, reserved savings 500,000, 15 days."""
    cfg = client_request(
        "POST",
        "/api/v1/budget/config",
        json={"opening_balance": 3000000, "unpaid_commitments": 1000000, "savings_reserved": 500000},
    )
    assert cfg.status_code == 200
    goal = client_request(
        "POST",
        "/api/v1/goal",
        json={"title": "Heo đất", "target_amount": 5000000, "deadline": "2027-03-01"},
        params=TODAY,
    )
    assert goal.status_code == 201


def _summary():
    res = client_request("GET", "/api/v1/budget/summary", params=TODAY)
    assert res.status_code == 200
    return res.json()


def test_allocate_moves_value_from_reserved_without_double_counting():
    """Blocking item 1: allocation must not protect the same money twice (plan §7)."""
    _setup_plan_section7_example()

    client_request("POST", "/api/v1/goal/allocate", json={"amount": 200000}, params=TODAY)
    data = _summary()
    assert (data["savings_allocated"], data["savings_reserved"]) == (200000, 300000)
    assert data["safe_to_spend"] == 1500000
    assert data["daily_budget"] == 100000

    # Allocate 100,000 more: discretionary funds stay at 1,500,000
    res = client_request("POST", "/api/v1/goal/allocate", json={"amount": 100000}, params=TODAY)
    assert res.status_code == 200
    data = _summary()
    assert (data["savings_allocated"], data["savings_reserved"]) == (300000, 200000)
    assert data["protected"] == 1500000
    assert data["safe_to_spend"] == 1500000
    assert data["daily_budget"] == 100000


def test_allocate_above_reserve_reduces_only_the_excess():
    """Allocating beyond the remaining reserve reduces discretionary funds by the excess."""
    _setup_plan_section7_example()
    client_request("POST", "/api/v1/goal/allocate", json={"amount": 200000}, params=TODAY)
    # reserved is 300,000; allocate 400,000 -> 100,000 excess
    client_request("POST", "/api/v1/goal/allocate", json={"amount": 400000}, params=TODAY)
    data = _summary()
    assert data["savings_reserved"] == 0  # never negative
    assert data["savings_allocated"] == 600000
    assert data["safe_to_spend"] == 1400000


def test_allocate_with_zero_reserve_reduces_discretionary_by_full_amount():
    client_request("POST", "/api/v1/budget/config", json={"opening_balance": 1000000})
    client_request(
        "POST",
        "/api/v1/goal",
        json={"title": "G", "target_amount": 900000, "deadline": "2027-01-01"},
        params=TODAY,
    )
    client_request("POST", "/api/v1/goal/allocate", json={"amount": 250000}, params=TODAY)
    data = _summary()
    assert data["savings_reserved"] == 0
    assert data["safe_to_spend"] == 750000


def test_second_goal_is_rejected_and_saved_money_stays_protected():
    """Blocking item 2: POST /goal twice must not drop the allocated savings."""
    _setup_plan_section7_example()
    client_request("POST", "/api/v1/goal/allocate", json={"amount": 200000}, params=TODAY)
    before = _summary()

    new_goal = {"title": "Goal 2", "target_amount": 1000000, "deadline": "2027-02-01"}
    for path in ("/api/v1/goal", "/api/v1/goals", "/v1/goal"):
        res = client_request("POST", path, json=new_goal, params=TODAY)
        assert res.status_code == 409, path

    after = _summary()
    assert after == before
    assert after["savings_allocated"] == 200000
    assert after["safe_to_spend"] == 1500000
    goals = client_request("GET", "/api/v1/goals", params=TODAY).json()
    assert len(goals) == 1 and goals[0]["allocated_amount"] == 200000

    # PATCH remains the way to edit, and preserves the allocation
    patch = client_request("PATCH", "/api/v1/goal", json={"target_amount": 1000000}, params=TODAY)
    assert patch.status_code == 200
    assert patch.json()["allocated_amount"] == 200000


def test_goal_create_rejects_client_supplied_balances():
    res = client_request(
        "POST",
        "/api/v1/goal",
        json={"title": "G", "target_amount": 1000, "deadline": "2027-01-01", "initial_allocated": 999999},
    )
    assert res.status_code == 422
    assert client_request("GET", "/api/v1/goal").status_code == 404


def test_idempotency_conflict_when_note_differs():
    payload = {
        "amount": 20000,
        "kind": "expense",
        "category": "Di chuyển",
        "date": "2026-11-19",
        "note": "Xe buýt",
        "idempotency_key": "tx-note-1",
    }
    assert client_request("POST", "/api/v1/transactions", json=payload).status_code == 201
    # Exact retry returns the original record
    assert client_request("POST", "/api/v1/transactions", json=payload).status_code == 201
    changed = dict(payload, note="Grab")
    assert client_request("POST", "/api/v1/transactions", json=changed).status_code == 409
    assert client_request("GET", "/api/v1/transactions").json()["total"] == 1


def test_budget_config_cannot_pin_days_remaining():
    """Non-blocking item: days_remaining stays derived from `today`, never sticky."""
    client_request("POST", "/api/v1/budget/config", json={"opening_balance": 100000, "planning_days_remaining": 10})
    d1 = client_request("GET", "/api/v1/budget/summary", params={"today": "2026-11-23"}).json()
    d2 = client_request("GET", "/api/v1/budget/summary", params={"today": "2026-11-29"}).json()
    assert (d1["days_remaining"], d2["days_remaining"]) == (8, 2)
