"""Cover transaction read and validation behavior through the FastAPI routes."""

from functools import partial

import pytest

from app.auth import AuthConfig
from app.main import create_app
from app.repository import InMemoryRepository

TRANSACTIONS = "/v1/transactions"


@pytest.fixture
def financial_api(request_api):
    application = create_app(
        auth_config=AuthConfig(local_dev_auth=True),
        repository=InMemoryRepository(),
    )
    return partial(request_api, application=application)


def transaction_payload(**overrides):
    return {
        "amount": 35_000,
        "kind": "expense",
        "category": "food",
        "date": "2026-11-20",
        "note": "Bữa trưa",
        "idempotency_key": "lunch-2026-11-20",
        **overrides,
    }


def test_get_transaction_returns_saved_record(financial_api):
    payload = transaction_payload()
    created = financial_api("POST", TRANSACTIONS, json=payload)
    assert created.status_code == 201, created.text
    transaction = created.json()

    retrieved = financial_api("GET", f"{TRANSACTIONS}/{transaction['id']}")

    assert retrieved.status_code == 200
    assert retrieved.json() == transaction
    assert {field: retrieved.json()[field] for field in payload} == payload
    assert financial_api("GET", f"{TRANSACTIONS}/missing-id").status_code == 404


def test_filters_apply_to_records_and_totals(financial_api):
    older_expense = transaction_payload(
        amount=12_000, category="transport", date="2026-11-19", idempotency_key="bus",
    )
    lunch = transaction_payload()
    income = transaction_payload(kind="income", amount=500_000, category="income", idempotency_key="income")
    later_expense = transaction_payload(amount=70_000, date="2026-11-21", idempotency_key="books")
    after_window = transaction_payload(amount=9_000, date="2026-11-22", idempotency_key="snack")
    for payload in (older_expense, lunch, income, later_expense, after_window):
        assert financial_api("POST", TRANSACTIONS, json=payload).status_code == 201

    response = financial_api(
        "GET", TRANSACTIONS,
        params={"start_date": "2026-11-20", "end_date": "2026-11-21", "kind": "expense"},
    )

    assert response.status_code == 200
    result = response.json()
    assert [item["idempotency_key"] for item in result["items"]] == ["books", "lunch-2026-11-20"]
    assert result["total"] == 2
    assert result["total_expense"] == 105_000
    assert result["total_income"] == 0

    all_transactions = financial_api("GET", TRANSACTIONS)
    assert all_transactions.status_code == 200
    assert all_transactions.json()["total_income"] == 500_000
    assert all_transactions.json()["total_expense"] == 126_000


def test_replaying_a_create_returns_the_same_record(financial_api):
    payload = transaction_payload()
    created = financial_api("POST", TRANSACTIONS, json=payload)
    assert created.status_code == 201, created.text

    replayed = financial_api("POST", TRANSACTIONS, json=payload)
    assert replayed.status_code == 201, replayed.text
    assert replayed.json() == created.json()

    ledger = financial_api("GET", TRANSACTIONS)
    assert ledger.status_code == 200
    assert ledger.json()["items"] == [created.json()]
    assert ledger.json()["total_expense"] == payload["amount"]


def test_creation_requires_an_idempotency_key(financial_api):
    payload = transaction_payload()
    del payload["idempotency_key"]

    rejected = financial_api("POST", TRANSACTIONS, json=payload)

    assert rejected.status_code == 422
    ledger = financial_api("GET", TRANSACTIONS)
    assert ledger.status_code == 200
    assert ledger.json()["items"] == []


@pytest.mark.parametrize(("field", "value"), [("amount", 50_000), ("note", "Bữa tối")])
def test_reusing_a_create_key_for_a_different_payload_returns_conflict(financial_api, field, value):
    payload = transaction_payload()
    created = financial_api("POST", TRANSACTIONS, json=payload)
    assert created.status_code == 201, created.text

    conflict = financial_api("POST", TRANSACTIONS, json={**payload, field: value})
    assert conflict.status_code == 409

    ledger = financial_api("GET", TRANSACTIONS)
    assert ledger.status_code == 200
    assert ledger.json()["items"] == [created.json()]
    assert ledger.json()["total_expense"] == payload["amount"]


@pytest.mark.parametrize(("field", "value"), [
    ("amount", 0),
    ("amount", -1),
    ("amount", 1.5),
    ("kind", "transfer"),
    ("date", "2026-02-30"),
    ("idempotency_key", ""),
])
def test_invalid_transaction_never_reaches_ledger(financial_api, field, value):
    rejected = financial_api("POST", TRANSACTIONS, json=transaction_payload(**{field: value}))

    assert rejected.status_code == 422
    ledger = financial_api("GET", TRANSACTIONS)
    assert ledger.status_code == 200
    assert ledger.json()["items"] == []
