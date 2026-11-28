"""Boundary validation for financial input (#56, MU01): unit and ASGI integration tests."""

from __future__ import annotations

import asyncio
import datetime as dt

import httpx
import pytest

import app.validation as validation
from app.auth import AuthConfig
from app.main import create_app
from app.repository import InMemoryRepository, get_current_date
from app.validation import (
    LARGE_EXPENSE_VND,
    LARGE_INCOME_VND,
    MAX_AMOUNT_VND,
    FinancialInputError,
    check_ledger_totals,
    check_transaction_date,
    format_vnd,
    large_amount,
)

# --- Unit rules -------------------------------------------------------------


@pytest.mark.parametrize(
    ("kind", "amount", "flagged"),
    [
        ("expense", LARGE_EXPENSE_VND - 1, False),
        ("expense", LARGE_EXPENSE_VND, True),
        ("income", LARGE_INCOME_VND - 1, False),
        ("income", LARGE_INCOME_VND, True),
        ("income", LARGE_EXPENSE_VND, False),  # a normal salary is not an outlier
    ],
)
def test_large_amount_thresholds(kind, amount, flagged):
    hit = large_amount(kind, amount)
    assert (hit is not None) is flagged
    if hit:
        assert hit.threshold == (LARGE_EXPENSE_VND if kind == "expense" else LARGE_INCOME_VND)


def test_transaction_date_cannot_be_in_the_future():
    today = dt.date(2026, 11, 26)
    check_transaction_date(today, today)
    check_transaction_date(dt.date(2025, 1, 1), today)  # backdating is allowed
    with pytest.raises(FinancialInputError) as exc:
        check_transaction_date(today + dt.timedelta(days=1), today)
    assert exc.value.code == "TRANSACTION_DATE_IN_FUTURE"


def test_ledger_totals_stay_in_safe_integer_range():
    assert validation.MAX_LEDGER_TOTAL_VND < 2**53
    check_ledger_totals(validation.MAX_LEDGER_TOTAL_VND, 0)
    with pytest.raises(FinancialInputError) as exc:
        check_ledger_totals(0, validation.MAX_LEDGER_TOTAL_VND + 1)
    assert exc.value.code == "LEDGER_LIMIT_EXCEEDED"


def test_format_vnd():
    assert format_vnd(5_000_000) == "5.000.000 ₫"


# --- ASGI integration ---------------------------------------------------------


@pytest.fixture
def app():
    return create_app(auth_config=AuthConfig(local_dev_auth=True), repository=InMemoryRepository())


def call(app, method, path, json=None):
    async def run():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, path, json=json)

    return asyncio.run(run())


TODAY = get_current_date().isoformat()


def tx(amount=50_000, kind="expense", key="k1", **extra):
    return {"amount": amount, "kind": kind, "category": "food", "date": TODAY, "idempotency_key": key, **extra}


def error_code(response):
    return response.json()["error"]["code"]


@pytest.mark.parametrize(
    "amount",
    [-50_000, 0, MAX_AMOUNT_VND + 1, "50000", 50_000.0, True, None],
)
def test_transaction_amount_hard_bounds(app, amount):
    response = call(app, "POST", "/api/v1/transactions", tx(amount=amount))
    assert response.status_code == 422
    assert error_code(response) == "VALIDATION_ERROR"
    assert response.json()["error"]["request_id"]
    assert call(app, "GET", "/api/v1/transactions").json()["total"] == 0


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("POST", "/api/v1/goal", {"title": "g", "target_amount": -1, "deadline": "2027-01-01"}),
        ("POST", "/api/v1/goal", {"title": "g", "target_amount": MAX_AMOUNT_VND + 1, "deadline": "2027-01-01"}),
        ("POST", "/api/v1/goal", {"title": "g", "target_amount": "1000", "deadline": "2027-01-01"}),
        ("PATCH", "/api/v1/goal", {"target_amount": 0}),
        ("POST", "/api/v1/goal/allocate", {"amount": MAX_AMOUNT_VND + 1}),
        ("POST", "/api/v1/goal/allocate", {"amount": -5}),
        ("POST", "/api/v1/budget/config", {"opening_balance": -1}),
        ("POST", "/api/v1/budget/config", {"unpaid_commitments": MAX_AMOUNT_VND + 1}),
        ("POST", "/api/v1/budget/config", {"savings_reserved": 1.5}),
        ("POST", "/api/v1/transactions", tx(confirm_large_amount="yes")),
    ],
)
def test_other_money_inputs_are_bounded(app, method, path, body):
    response = call(app, method, path, body)
    assert response.status_code == 422
    assert error_code(response) == "VALIDATION_ERROR"


def test_large_expense_needs_confirmation_then_records_once(app):
    big = tx(amount=LARGE_EXPENSE_VND, key="laptop")
    rejected = call(app, "POST", "/api/v1/transactions", big)
    assert rejected.status_code == 422
    assert error_code(rejected) == "LARGE_AMOUNT_CONFIRMATION_REQUIRED"
    assert "5.000.000 ₫" in rejected.json()["error"]["message"]
    assert call(app, "GET", "/api/v1/transactions").json()["total"] == 0

    confirmed = call(app, "POST", "/api/v1/transactions", {**big, "confirm_large_amount": True})
    assert confirmed.status_code == 201
    assert "confirm_large_amount" not in confirmed.json()

    # A network retry of the same entry (even without the flag) returns the original.
    retry = call(app, "POST", "/api/v1/transactions", big)
    assert retry.status_code == 201 and retry.json()["id"] == confirmed.json()["id"]
    assert call(app, "GET", "/api/v1/transactions").json()["total_expense"] == LARGE_EXPENSE_VND


def test_large_income_needs_confirmation(app):
    assert call(app, "POST", "/api/v1/transactions", tx(LARGE_INCOME_VND - 1, "income", "salary")).status_code == 201
    response = call(app, "POST", "/api/v1/transactions", tx(LARGE_INCOME_VND, "income", "prize"))
    assert error_code(response) == "LARGE_AMOUNT_CONFIRMATION_REQUIRED"


def test_ordinary_overspending_is_still_recorded(app):
    """Plan §7: an actual expense may make cash negative; keep the record."""
    call(app, "POST", "/api/v1/budget/config", {"opening_balance": 100_000})
    assert call(app, "POST", "/api/v1/transactions", tx(amount=200_000)).status_code == 201
    summary = call(app, "GET", f"/api/v1/budget/summary?today={TODAY}").json()
    assert summary["cash"] == -100_000 and summary["funding_shortfall"] == 100_000


def test_future_dated_transaction_is_rejected(app):
    tomorrow = (get_current_date() + dt.timedelta(days=1)).isoformat()
    response = call(app, "POST", "/api/v1/transactions", {**tx(), "date": tomorrow})
    assert response.status_code == 422
    assert error_code(response) == "TRANSACTION_DATE_IN_FUTURE"
    assert call(app, "POST", "/api/v1/transactions", tx(key="today")).status_code == 201


def test_ledger_total_limit(app, monkeypatch):
    monkeypatch.setattr(validation, "MAX_LEDGER_TOTAL_VND", 150_000)
    assert call(app, "POST", "/api/v1/transactions", tx(100_000, "income", "a")).status_code == 201
    response = call(app, "POST", "/api/v1/transactions", tx(100_000, "income", "b"))
    assert error_code(response) == "LEDGER_LIMIT_EXCEEDED"
    assert call(app, "GET", "/api/v1/transactions").json()["total_income"] == 100_000


def test_ledger_limit_is_per_student(monkeypatch):
    """Another student's ledger never counts toward my totals."""
    from app.schemas import TransactionCreate

    monkeypatch.setattr(validation, "MAX_LEDGER_TOTAL_VND", 150_000)
    repo = InMemoryRepository()
    entry = TransactionCreate(
        amount=100_000, kind="income", category="pay", date=get_current_date(), idempotency_key="x"
    )
    repo.create_transaction("student-a", entry)
    repo.create_transaction("student-b", entry)  # would exceed only if ledgers were shared
    assert len(repo.list_transactions("student-b")) == 1


# --- Boundary cases requested in review ---------------------------------------


@pytest.mark.parametrize(
    ("kind", "amount", "confirm", "status"),
    [
        ("expense", LARGE_EXPENSE_VND - 1, False, 201),  # just below MU01: no prompt
        ("income", LARGE_INCOME_VND, True, 201),  # at threshold with confirmation
        ("expense", MAX_AMOUNT_VND, True, 201),  # hard maximum with confirmation
    ],
)
def test_boundary_amounts_accepted(app, kind, amount, confirm, status):
    body = tx(amount=amount, kind=kind, key=f"{kind}-{amount}", confirm_large_amount=confirm)
    assert call(app, "POST", "/api/v1/transactions", body).status_code == status


@pytest.mark.parametrize(
    "body",
    [
        {"opening_balance": 0, "unpaid_commitments": 0, "savings_reserved": 0},
        {"opening_balance": None, "unpaid_commitments": None, "savings_reserved": None},
        {"opening_balance": MAX_AMOUNT_VND},
    ],
)
def test_budget_config_accepts_zero_null_and_max(app, body):
    assert call(app, "POST", "/api/v1/budget/config", body).status_code == 200


def test_ledger_limit_is_reported_before_large_amount_prompt(app, monkeypatch):
    """Never ask the student to confirm an entry that would be rejected anyway."""
    monkeypatch.setattr(validation, "MAX_LEDGER_TOTAL_VND", LARGE_EXPENSE_VND)
    call(app, "POST", "/api/v1/transactions", tx(1_000, key="small"))
    response = call(app, "POST", "/api/v1/transactions", tx(LARGE_EXPENSE_VND, key="big"))
    assert error_code(response) == "LEDGER_LIMIT_EXCEEDED"
