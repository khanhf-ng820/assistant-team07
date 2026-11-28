"""Store sanitized capture media and expire temporary clips (#52).

The receipt/voice capture endpoints (#48/#49) call ``store_capture_media`` with
the verified ``user_id`` and the uploaded bytes. Confirming the reviewed draft
then calls ``InMemoryRepository.create_expense_with_media`` (the in-memory twin
of ``public.confirm_expense_with_media``) to link the media to the expense.
"""

from __future__ import annotations

import datetime as dt
import uuid

from app.media import MediaKind, sanitize_media
from app.media_storage import MediaStorage, MediaStorageError, build_object_path
from app.repository import InMemoryRepository, MediaRecord

# All capture media is temporary (plan §10: do not store raw receipts or audio
# by default). Unconfirmed files expire after this window; confirming an expense
# makes its files due for deletion at once, keeping only metadata and the link.
MEDIA_RETENTION = dt.timedelta(hours=24)


def store_capture_media(
    *,
    repository: InMemoryRepository,
    storage: MediaStorage,
    user_id: str,
    kind: MediaKind,
    data: bytes,
    declared_mime: str | None = None,
    now: dt.datetime | None = None,
) -> MediaRecord:
    """Validate, strip metadata, upload, and record one capture file.

    Raises ``MediaValidationError`` (nothing uploaded) or ``MediaStorageError``.
    If recording the metadata fails after upload, the object is deleted again.
    """
    clean = sanitize_media(kind, data, declared_mime)
    owner_id = user_id.strip()
    media_id = str(uuid.uuid4())
    path = build_object_path(owner_id, kind, media_id, clean.extension)
    current = now or dt.datetime.now(dt.timezone.utc)

    storage.put(path, clean.data, clean.mime_type)
    try:
        return repository.register_media(
            MediaRecord(
                id=media_id,
                owner_id=owner_id,
                kind=kind,
                mime_type=clean.mime_type,
                size_bytes=clean.size_bytes,
                sha256=clean.sha256,
                storage_path=path,
                created_at=current,
                expires_at=current + MEDIA_RETENTION,
                width=clean.width,
                height=clean.height,
                duration_ms=clean.duration_ms,
            )
        )
    except Exception:
        try:
            storage.delete([path])
        except MediaStorageError:
            pass  # keep the original error; the object stays orphaned (no record to purge it)
        raise


def purge_expired_media(
    repository: InMemoryRepository, storage: MediaStorage, now: dt.datetime | None = None
) -> int:
    """Delete expired objects from storage, then update their records.

    Records change only after storage deletion succeeds, so a storage outage
    leaves everything in place for the next run instead of orphaning objects.
    """
    current = now or dt.datetime.now(dt.timezone.utc)
    paths = repository.expired_media_paths(current)
    if paths:
        storage.delete(paths)
        repository.mark_media_purged(paths, current)
    return len(paths)
