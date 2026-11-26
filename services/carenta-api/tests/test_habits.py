from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.auth import AuthConfig
from app.main import create_app
from app.repository import InMemoryRepository, get_current_date
from app.schemas import TransactionCreate

TODAY = date(2026, 11, 26)


def log_expense(
    repo, days_ago, amount=30_000, *, today=TODAY, owner="student-a",
    note="Trà sữa", category="food", kind="expense",
):
    return repo.create_transaction(owner, TransactionCreate(
        amount=amount,
        kind=kind,
        date=today - timedelta(days=days_ago),
        category=category,
        note=note,
        idempotency_key=uuid4().hex,
    ))


@pytest.mark.parametrize(("observations", "expected"), [
    pytest.param([(day, 30_000) for day in range(1, 8)], 1.0, id="daily"),
    pytest.param([(day, 30_000) for day in range(1, 6)], 0.8, id="at-threshold"),
    pytest.param([(day, 30_000) for day in range(1, 5)], None, id="too-few-days"),
    pytest.param([(1, 30_000)] * 8, None, id="same-day-burst"),
    pytest.param([(day, 29_000 + day * 100) for day in range(1, 8)], None, id="unstable-prices"),
    pytest.param([(day, 30_000) for day in range(3, 8)], None, id="no-recent-repeat"),
    pytest.param([(day, 30_000) for day in range(1, 6)] + [(6, 40_000)], None, id="below-confidence"),
    pytest.param([(day, 30_000) for day in range(1, 6)] + [(3, 30_000)], None, id="ambiguous-day"),
    pytest.param([(day, 30_000) for day in range(8, 15)], None, id="too-old"),
    pytest.param([(day, 30_000) for day in range(-7, 0)], None, id="future-expenses"),
])
def test_habit_threshold_evaluation(observations, expected):
    repo = InMemoryRepository()
    for day, amount in observations:
        log_expense(repo, day, amount, note=" TRÀ  SỮA " if day % 2 == 0 else "Trà sữa")
    suggestion = repo.get_habit_suggestion("student-a", TODAY)
    if expected is None:
        assert suggestion is None
    else:
        assert suggestion is not None
        assert suggestion.confidence == expected
        assert suggestion.amount == 30_000
        assert suggestion.note == "Trà sữa"


def test_ignore_income_and_unnamed_expenses():
    repo = InMemoryRepository()
    for day in range(1, 8):
        log_expense(repo, day, kind="income")
        log_expense(repo, day, note="  ")
    assert repo.get_habit_suggestion("student-a", TODAY) is None


def test_confirm_is_single_write_with_parallel_retries_and_owner_isolation():
    repo = InMemoryRepository()
    for day in range(1, 8):
        log_expense(repo, day)
        log_expense(repo, day, owner="student-b")
        log_expense(repo, day, category="transport", note="Xe buýt")
    draft = repo.get_habit_suggestion("student-a", TODAY)
    other = repo.get_habit_suggestion("student-b", TODAY)
    assert draft and other and draft.id != other.id
    assert repo.confirm_habit("student-b", draft.id, TODAY) is None
    assert not repo.dismiss_habit("student-b", draft.id, TODAY)

    with ThreadPoolExecutor(max_workers=4) as pool:
        writes = list(pool.map(lambda _: repo.confirm_habit("student-a", draft.id, TODAY), range(8)))
    assert writes[0] is not None
    assert all(write == writes[0] for write in writes)
    assert repo.list_transactions("student-a", start_date=TODAY) == [writes[0]]
    assert repo.get_habit_suggestion("student-a", TODAY) is None
    assert repo.confirm_habit("student-a", draft.id, TODAY + timedelta(days=1)) == writes[0]
    assert repo.get_habit_suggestion("student-b", TODAY) == other


def test_dismissal_suppresses_same_habit_for_a_week_without_writing():
    repo = InMemoryRepository()
    for day in range(1, 8):
        log_expense(repo, day)
    draft = repo.get_habit_suggestion("student-a", TODAY)
    assert draft and repo.dismiss_habit("student-a", draft.id, TODAY)
    assert repo.list_transactions("student-a", start_date=TODAY) == []
    assert repo.get_habit_suggestion("student-a", TODAY) is None
    assert repo.confirm_habit("student-a", draft.id, TODAY) is None

    for day in range(6):
        log_expense(repo, -day)
    assert repo.get_habit_suggestion("student-a", TODAY + timedelta(days=6)) is None
    assert repo.get_habit_suggestion("student-a", TODAY + timedelta(days=7)) is not None


def test_manual_entry_invalidates_a_draft_even_if_purchase_price_changed():
    repo = InMemoryRepository()
    for day in range(1, 8):
        log_expense(repo, day)
    draft = repo.get_habit_suggestion("student-a", TODAY)
    assert draft
    entry = log_expense(repo, 0, 32_000, note="trà  sữa")
    assert repo.get_habit_suggestion("student-a", TODAY) is None
    assert repo.confirm_habit("student-a", draft.id, TODAY) is None
    assert repo.list_transactions("student-a", start_date=TODAY) == [entry]


def test_routes_read_preview_confirm_and_dismiss():
    repo = InMemoryRepository()
    today = get_current_date()
    for day in range(1, 8):
        log_expense(repo, day, today=today)
    app = create_app(repository=repo, auth_config=AuthConfig(
        local_dev_auth=True, local_dev_user_id="student-a",
    ))
    with TestClient(app) as client:
        preview = client.get("/api/v1/habits/suggestion")
        assert preview.status_code == 200
        assert preview.headers["cache-control"] == "no-store"
        draft = preview.json()["suggestion"]
        assert draft["amount"] == 30_000
        path = f"/api/v1/habits/{draft['id']}"
        assert client.post(f"{path}/dismiss").json() == {"suggestion": None}
        assert client.get("/v1/habits/suggestion").json() == {"suggestion": None}
        stale = client.post(f"{path}/confirm")
        assert stale.status_code == 409
        assert stale.json()["error"]["code"] == "HABIT_STALE"
        assert client.post("/api/v1/habits/invalid/dismiss").status_code == 422

        repo.reset()
        for day in range(1, 8):
            log_expense(repo, day, today=today)
        committed = client.post(f"{path}/confirm")
        assert committed.status_code == 200
        assert committed.json()["amount"] == 30_000
        assert client.post(f"{path}/confirm").json() == committed.json()
        assert client.get("/v1/transactions", params={"start_date": today}).json()["items"] == [committed.json()]

    with TestClient(create_app(repository=repo, auth_config=AuthConfig())) as client:
        assert client.get("/api/v1/habits/suggestion").status_code == 401
        assert client.post(f"{path}/confirm").status_code == 401
        assert client.post(f"{path}/dismiss").status_code == 401
