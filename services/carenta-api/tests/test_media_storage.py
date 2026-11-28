"""Supabase Storage client for capture media (#52), exercised with a fake transport."""

from __future__ import annotations

import json
import urllib.error

import pytest
from pydantic import SecretStr

from app.media_storage import (
    HttpResult,
    InMemoryMediaStorage,
    MediaStorageError,
    SupabaseMediaStorage,
    build_object_path,
)
from app.settings import SupabaseSettings

SECRET = "service-role-test-secret"
SETTINGS = SupabaseSettings(
    url="https://example-ref.supabase.co/",
    anon_key=SecretStr("anon-test"),
    service_role_key=SecretStr(SECRET),
)


class FakeTransport:
    def __init__(self, status: int = 200, raises: Exception | None = None) -> None:
        self.status = status
        self.raises = raises
        self.requests = []

    def __call__(self, request, timeout):
        self.requests.append((request, timeout))
        if self.raises:
            raise self.raises
        return HttpResult(self.status, b"{}")


def test_upload_goes_to_private_bucket_with_server_key():
    transport = FakeTransport()
    storage = SupabaseMediaStorage(SETTINGS, transport=transport)
    storage.put("u1/receipt/m1.jpg", b"data", "image/jpeg")

    request, timeout = transport.requests[0]
    assert request.get_method() == "POST"
    assert request.full_url == "https://example-ref.supabase.co/storage/v1/object/capture-media/u1/receipt/m1.jpg"
    headers = {k.lower(): v for k, v in request.header_items()}
    assert headers["authorization"] == f"Bearer {SECRET}"
    assert headers["content-type"] == "image/jpeg"
    assert headers["x-upsert"] == "false"
    assert request.data == b"data" and timeout > 0


def test_delete_sends_prefix_list_and_skips_empty():
    transport = FakeTransport()
    storage = SupabaseMediaStorage(SETTINGS, transport=transport)
    storage.delete([])
    assert transport.requests == []
    storage.delete(["u1/voice/a.m4a", "u1/voice/b.m4a"])
    request, _ = transport.requests[0]
    assert request.get_method() == "DELETE"
    assert request.full_url.endswith("/storage/v1/object/capture-media")
    assert json.loads(request.data) == {"prefixes": ["u1/voice/a.m4a", "u1/voice/b.m4a"]}


@pytest.mark.parametrize(
    "transport",
    [FakeTransport(status=403), FakeTransport(raises=urllib.error.URLError("offline")), FakeTransport(raises=TimeoutError())],
)
def test_failures_never_leak_credentials(transport):
    storage = SupabaseMediaStorage(SETTINGS, transport=transport)
    with pytest.raises(MediaStorageError) as exc:
        storage.put("u1/receipt/m1.jpg", b"x", "image/jpeg")
    assert SECRET not in str(exc.value) and "anon-test" not in str(exc.value)


@pytest.mark.parametrize(
    ("owner", "kind", "media_id", "ext"),
    [
        ("../etc", "receipt", "m1", "jpg"),
        ("u1", "receipt", "a/b", "jpg"),
        ("u1", "selfie", "m1", "jpg"),
        ("u1", "receipt", "m1", "exe"),
        ("", "voice", "m1", "m4a"),
    ],
)
def test_object_paths_reject_unsafe_segments(owner, kind, media_id, ext):
    with pytest.raises(ValueError):
        build_object_path(owner, kind, media_id, ext)


def test_object_path_layout():
    assert build_object_path("0b6c-u1", "voice", "m-1", "m4a") == "0b6c-u1/voice/m-1.m4a"


def test_in_memory_storage_refuses_overwrite():
    storage = InMemoryMediaStorage()
    storage.put("u1/receipt/m1.jpg", b"a", "image/jpeg")
    with pytest.raises(MediaStorageError):
        storage.put("u1/receipt/m1.jpg", b"b", "image/jpeg")
    storage.delete(["u1/receipt/m1.jpg", "missing"])
    assert storage.objects == {}
