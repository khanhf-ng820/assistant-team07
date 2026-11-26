"""Storing capture media and linking it to confirmed expenses (#52)."""

from __future__ import annotations

import datetime as dt

import pytest

from app.capture_media import MEDIA_RETENTION, purge_expired_media, store_capture_media
from app.media import MediaValidationError
from app.media_storage import InMemoryMediaStorage, MediaStorageError
from app.repository import IdempotencyConflictError, InMemoryRepository, MediaLinkError
from app.schemas import TransactionCreate
from media_samples import GPS_MARKER, jpeg, m4a

NOW = dt.datetime(2026, 11, 26, 9, 0, tzinfo=dt.timezone.utc)


@pytest.fixture
def repo():
    return InMemoryRepository()


@pytest.fixture
def storage():
    return InMemoryMediaStorage()


def store(repo, storage, user="student-a", kind="receipt", data=None, now=NOW):
    data = data if data is not None else (jpeg() if kind == "receipt" else m4a())
    return store_capture_media(
        repository=repo, storage=storage, user_id=user, kind=kind, data=data, now=now
    )


def expense(key="lunch-receipt-1", amount=65_000, kind="expense"):
    return TransactionCreate(
        amount=amount, kind=kind, category="food", date=dt.date(2026, 11, 26), idempotency_key=key
    )


def test_store_uploads_sanitized_bytes_under_owner_folder(repo, storage):
    record = store(repo, storage)
    assert record.storage_path == f"student-a/receipt/{record.id}.jpg"
    stored, mime = storage.objects[record.storage_path]
    assert mime == "image/jpeg" and GPS_MARKER not in stored
    assert record.size_bytes == len(stored) and (record.width, record.height) == (640, 480)
    assert record.transaction_id is None and record.expires_at == NOW + MEDIA_RETENTION
    assert repo.get_media("student-a", record.id) == record


def test_invalid_upload_stores_nothing(repo, storage):
    with pytest.raises(MediaValidationError):
        store(repo, storage, data=b"not an image")
    assert storage.objects == {}


def test_storage_outage_records_nothing(repo):
    class Down(InMemoryMediaStorage):
        def put(self, path, data, mime_type):
            raise MediaStorageError("Storage upload failed: service unreachable.")

    with pytest.raises(MediaStorageError):
        store(repo, Down())
    assert repo.list_transactions("student-a") == []


def test_upload_is_removed_if_metadata_cannot_be_recorded(repo, storage, monkeypatch):
    def boom(record):
        raise RuntimeError("db write failed")

    monkeypatch.setattr(repo, "register_media", boom)
    with pytest.raises(RuntimeError):
        store(repo, storage)
    assert storage.objects == {}


def test_confirm_links_receipt_and_voice_to_one_expense(repo, storage):
    receipt = store(repo, storage)
    voice = store(repo, storage, kind="voice")
    tx = repo.create_expense_with_media("student-a", expense(), [receipt.id, voice.id], now=NOW)

    linked_receipt = repo.get_media("student-a", receipt.id)
    linked_voice = repo.get_media("student-a", voice.id)
    assert linked_receipt.transaction_id == linked_voice.transaction_id == tx.id
    assert linked_receipt.expires_at is None  # receipts kept as evidence
    assert linked_voice.expires_at == voice.expires_at  # voice stays temporary
    assert [t.id for t in repo.list_transactions("student-a")] == [tx.id]


def test_retry_returns_same_expense_without_duplicates(repo, storage):
    receipt = store(repo, storage)
    first = repo.create_expense_with_media("student-a", expense(), [receipt.id], now=NOW)
    again = repo.create_expense_with_media("student-a", expense(), [receipt.id, receipt.id], now=NOW)
    assert again.id == first.id
    assert len(repo.list_transactions("student-a")) == 1


def test_reusing_key_with_different_payload_conflicts(repo, storage):
    receipt = store(repo, storage)
    repo.create_expense_with_media("student-a", expense(), [receipt.id], now=NOW)
    with pytest.raises(IdempotencyConflictError):
        repo.create_expense_with_media("student-a", expense(amount=1), [receipt.id], now=NOW)


@pytest.mark.parametrize(
    ("setup", "code"),
    [
        ("already_linked", "MEDIA_ALREADY_LINKED"),
        ("expired", "MEDIA_EXPIRED"),
        ("other_student", "MEDIA_NOT_FOUND"),
        ("unknown", "MEDIA_NOT_FOUND"),
        ("income", "MEDIA_NOT_EXPENSE"),
        ("none", "MEDIA_NOT_FOUND"),
    ],
)
def test_failed_confirmation_writes_nothing(repo, storage, setup, code):
    good = store(repo, storage)
    ids = [good.id]
    data = expense(key="second")
    now = NOW
    if setup == "already_linked":
        other = store(repo, storage)
        repo.create_expense_with_media("student-a", expense(key="first"), [other.id], now=NOW)
        ids.append(other.id)
    elif setup == "expired":
        now = NOW + MEDIA_RETENTION
    elif setup == "other_student":
        ids.append(store(repo, storage, user="student-b").id)
    elif setup == "unknown":
        ids.append("missing")
    elif setup == "income":
        data = expense(key="second", kind="income")
    elif setup == "none":
        ids = []
    before = len(repo.list_transactions("student-a"))

    with pytest.raises(MediaLinkError) as exc:
        repo.create_expense_with_media("student-a", data, ids, now=now)

    assert exc.value.code == code
    assert len(repo.list_transactions("student-a")) == before
    assert repo.get_media("student-a", good.id).transaction_id is None


def test_purge_removes_expired_objects_and_keeps_linked_receipts(repo, storage):
    pending = store(repo, storage)
    voice = store(repo, storage, kind="voice")
    kept = store(repo, storage)
    repo.create_expense_with_media("student-a", expense(), [voice.id, kept.id], now=NOW)

    assert purge_expired_media(repo, storage, now=NOW + dt.timedelta(hours=1)) == 0
    assert purge_expired_media(repo, storage, now=NOW + MEDIA_RETENTION) == 2

    assert repo.get_media("student-a", pending.id) is None  # never confirmed: gone
    purged_voice = repo.get_media("student-a", voice.id)
    assert purged_voice.transaction_id and purged_voice.purged_at  # link kept, audio gone
    assert list(storage.objects) == [kept.storage_path]
    assert purge_expired_media(repo, storage, now=NOW + 2 * MEDIA_RETENTION) == 0


def test_purge_keeps_records_when_storage_delete_fails(repo, storage):
    pending = store(repo, storage)

    class FailingDelete(InMemoryMediaStorage):
        def delete(self, paths):
            raise MediaStorageError("Storage delete failed with HTTP 503.")

    with pytest.raises(MediaStorageError):
        purge_expired_media(repo, FailingDelete(), now=NOW + MEDIA_RETENTION)
    assert repo.get_media("student-a", pending.id) is not None
