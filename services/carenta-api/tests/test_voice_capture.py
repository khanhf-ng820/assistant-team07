"""HTTP-seam and unit tests for Voice Capture (#112 / Spec #111)."""

from __future__ import annotations

import asyncio
import base64
import datetime as dt
from concurrent.futures import ThreadPoolExecutor

import httpx
import jwt
import pytest

from app.auth import AuthConfig
from app.errors import ApiHttpError
from app.main import create_app
from app.repository import InMemoryRepository
from app.voice_capture import (
    VoiceQuotaTracker,
    normalize_voice_draft,
    parse_vietnamese_amount,
)
from tests.voice_test_helpers import make_box as _box, make_m4a_bytes as _make_m4a_bytes, make_wav_bytes

TEST_SECRET = "test-hmac-secret-at-least-32-bytes-long"
TEST_ISSUER = "https://proj.supabase.co/auth/v1"


def _make_token(sub: str = "student-a") -> str:
    now = dt.datetime.now(dt.timezone.utc)
    claims = {
        "sub": sub,
        "email": f"{sub}@hcmus.edu.vn",
        "role": "authenticated",
        "aud": "authenticated",
        "iss": TEST_ISSUER,
        "iat": int(now.timestamp()),
        "exp": int((now + dt.timedelta(seconds=3600)).timestamp()),
    }
    return jwt.encode(claims, TEST_SECRET, algorithm="HS256")


def _parse_box_headers(data: bytes) -> list[tuple[bytes, bytes]]:
    boxes: list[tuple[bytes, bytes]] = []
    pos = 0
    while pos < len(data):
        size = int.from_bytes(data[pos : pos + 4], "big")
        box_type = data[pos + 4 : pos + 8]
        boxes.append((box_type, data[pos + 8 : pos + size]))
        pos += size
    return boxes


def _request(
    app,
    method: str,
    path: str,
    *,
    json: dict | None = None,
    headers: dict[str, str] | None = None,
):
    async def run():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, path, json=json, headers=headers)

    return asyncio.run(run())


class _FakeVoiceParser:
    def __init__(self, result: dict) -> None:
        self.calls: list[tuple[bytes, str, int | None]] = []
        self._result = result

    async def parse(
        self,
        audio_bytes: bytes,
        mime_type: str,
        *,
        duration_ms: int | None = None,
    ) -> dict:
        self.calls.append((audio_bytes, mime_type, duration_ms))
        return self._result


def test_voice_capture_requires_auth_and_returns_503_when_parser_unconfigured():
    repo = InMemoryRepository()
    fail_closed_app = create_app(
        auth_config=AuthConfig(
            supabase_url="https://proj.supabase.co",
            jwt_secret=TEST_SECRET,
            local_dev_auth=False,
        ),
        repository=repo,
    )
    payload = {
        "audio_base64": base64.b64encode(_make_m4a_bytes()).decode("ascii"),
        "mime_type": "audio/m4a",
        "duration_ms": 4000,
    }

    for path in ("/api/v1/capture/voice", "/v1/captures/voice"):
        unauth = _request(fail_closed_app, "POST", path, json=payload)
        assert unauth.status_code == 401
        assert unauth.json()["error"]["code"] == "AUTH_REQUIRED"

    headers = {"Authorization": f"Bearer {_make_token('student-a')}"}
    unconfigured = _request(
        fail_closed_app,
        "POST",
        "/api/v1/capture/voice",
        json=payload,
        headers=headers,
    )
    assert unconfigured.status_code == 503
    assert unconfigured.json()["error"]["code"] == "VOICE_PARSER_UNAVAILABLE"


def test_voice_capture_succeeds_on_both_routes_without_mutating_ledger():
    repo = InMemoryRepository()
    fake_parser = _FakeVoiceParser(
        {
            "amount": 35000,
            "currency": "VND",
            "category": "food",
            "merchant": "Cơm sườn",
            "description": "Cơm sườn 35k",
            "recognized_text": "Cơm sườn 35k",
            "occurred_on": "2026-11-28",
            "timestamp": None,
            "uncertain_fields": [],
            "has_low_confidence": False,
        }
    )
    app = create_app(
        auth_config=AuthConfig(local_dev_auth=True, local_dev_user_id="dev-student"),
        repository=repo,
        voice_parser=fake_parser,
    )
    repo.configure_budget("dev-student", opening_balance=500_000)
    payload = {
        "audio_base64": base64.b64encode(_make_m4a_bytes()).decode("ascii"),
        "mime_type": "audio/m4a",
        "duration_ms": 4000,
    }

    for path in ("/api/v1/capture/voice", "/v1/captures/voice"):
        res = _request(app, "POST", path, json=payload)
        assert res.status_code == 200
        body = res.json()
        assert body["amount"] == 35000
        assert body["currency"] == "VND"
        assert body["category"] == "food"
        assert body["recognized_text"] == "Cơm sườn 35k"
        assert body["occurred_on"] == "2026-11-28"
        assert body["timestamp"] is None
        assert body["uncertain_fields"] == []
        assert body["has_low_confidence"] is False

    assert len(fake_parser.calls) == 2
    assert repo.list_transactions("dev-student") == []
    assert repo.get_budget_summary("dev-student").safe_to_spend == 500_000


class _RecordingStorageHook:
    def __init__(self) -> None:
        self.stored: list[tuple[str, bytes, str]] = []

    async def store(self, *, user_id: str, audio_bytes: bytes, mime_type: str) -> str | None:
        self.stored.append((user_id, audio_bytes, mime_type))
        return "memory://clip-1"


def test_voice_capture_rejects_oversized_audio_with_413_and_extra_fields_with_422():
    fake_parser = _FakeVoiceParser({"recognized_text": "Cơm sườn 35k", "amount": 35000})
    app = create_app(
        auth_config=AuthConfig(local_dev_auth=True),
        voice_parser=fake_parser,
    )

    extra_res = _request(
        app,
        "POST",
        "/api/v1/capture/voice",
        json={
            "audio_base64": base64.b64encode(_make_m4a_bytes()).decode("ascii"),
            "mime_type": "audio/m4a",
            "unexpected": "nope",
        },
    )
    assert extra_res.status_code == 422
    assert extra_res.json()["error"]["code"] == "VALIDATION_ERROR"

    too_big_bytes = b"\x00" * (2 * 1024 * 1024 + 1)
    big_res = _request(
        app,
        "POST",
        "/api/v1/capture/voice",
        json={
            "audio_base64": base64.b64encode(too_big_bytes).decode("ascii"),
            "mime_type": "audio/m4a",
        },
    )
    assert big_res.status_code == 413
    assert big_res.json()["error"]["code"] == "VOICE_AUDIO_TOO_LARGE"
    assert len(fake_parser.calls) == 0


def test_voice_capture_normalizes_mime_and_verifies_magic_bytes_across_formats():
    fake_parser = _FakeVoiceParser({"recognized_text": "Trà đá 5k", "amount": 5000})
    app = create_app(
        auth_config=AuthConfig(local_dev_auth=True),
        voice_parser=fake_parser,
    )

    valid_samples = [
        ("audio/x-m4a", "audio/m4a", _make_m4a_bytes()),
        ("audio/mp4; codecs=mp4a.40.2", "audio/mp4", _make_m4a_bytes(brand=b"mp42")),
        ("audio/x-aac;codecs=aac", "audio/aac", b"\xff\xf1\x50\x80\x02\x00\xfc\x00"),
        ("audio/wav", "audio/wav", b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00"),
        ("audio/webm;codecs=opus", "audio/webm", b"\x1a\x45\xdf\xa3\x9f\x42\x86\x81\x01"),
        ("audio/mpeg", "audio/mpeg", b"ID3\x04\x00\x00\x00\x00\x00\x00\xff\xfb\x90\x00"),
        ("audio/ogg; codecs=opus", "audio/ogg", b"OggS\x00\x02\x00\x00\x00\x00\x00\x00"),
    ]
    for declared_mime, expected_mime, raw_bytes in valid_samples:
        res = _request(
            app,
            "POST",
            "/api/v1/capture/voice",
            json={
                "audio_base64": base64.b64encode(raw_bytes).decode("ascii"),
                "mime_type": declared_mime,
            },
        )
        assert res.status_code == 200, f"failed for {declared_mime}: {res.text}"
        assert fake_parser.calls[-1][1] == expected_mime

    unsupported = _request(
        app,
        "POST",
        "/api/v1/capture/voice",
        json={
            "audio_base64": base64.b64encode(b"fLaC\x00\x00\x00\x22").decode("ascii"),
            "mime_type": "audio/flac",
        },
    )
    assert unsupported.status_code == 422
    assert unsupported.json()["error"]["code"] == "VOICE_UNSUPPORTED_MEDIA_TYPE"

    # Magic-byte mismatches (including ADTS AAC vs MP3 frame sync)
    mismatches = [
        ("audio/wav", _make_m4a_bytes()),
        ("audio/m4a", b"RIFF\x24\x00\x00\x00WAVEfmt "),
        ("audio/mpeg", b"\xff\xf1\x50\x80\x02\x00\xfc\x00"),
        ("audio/aac", b"\xff\xfb\x90\x00\x00\x00\x00\x00"),
        ("audio/ogg", b"\x1a\x45\xdf\xa3\x00\x00\x00\x00"),
    ]
    for declared_mime, wrong_bytes in mismatches:
        res = _request(
            app,
            "POST",
            "/api/v1/capture/voice",
            json={
                "audio_base64": base64.b64encode(wrong_bytes).decode("ascii"),
                "mime_type": declared_mime,
            },
        )
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "VOICE_INVALID_AUDIO"

    for bad_b64 in ("", "   ", "not!valid!base64"):
        res = _request(
            app,
            "POST",
            "/api/v1/capture/voice",
            json={"audio_base64": bad_b64, "mime_type": "audio/m4a"},
        )
        assert res.status_code == 422
        assert res.json()["error"]["code"] == "VOICE_INVALID_AUDIO"


def test_voice_capture_enforces_mvhd_duration_and_strips_udta_meta_in_memory():
    fake_parser = _FakeVoiceParser({"recognized_text": "Cà phê 25k", "amount": 25000})
    storage_hook = _RecordingStorageHook()
    app = create_app(
        auth_config=AuthConfig(local_dev_auth=True, local_dev_user_id="student-strip"),
        voice_parser=fake_parser,
        voice_storage_hook=storage_hook,
    )

    # Exact 30s mvhd v0 succeeds, with top-level meta & moov-child udta stripped to zeroed 'free'
    m4a_with_metadata = _make_m4a_bytes(
        timescale=1000,
        duration=30_000,
        top_extra_boxes=_box(b"meta", b"secret-gps-location"),
        moov_extra_boxes=_box(b"udta", b"secret-device-owner") + _box(b"meta", b"secret-itunes-tag"),
    )
    ok_res = _request(
        app,
        "POST",
        "/api/v1/capture/voice",
        json={
            "audio_base64": base64.b64encode(m4a_with_metadata).decode("ascii"),
            "mime_type": "audio/x-m4a",
            "duration_ms": 30_000,
        },
    )
    assert ok_res.status_code == 200
    stripped_audio = fake_parser.calls[-1][0]
    assert len(stripped_audio) == len(m4a_with_metadata)
    for secret in (b"secret-gps-location", b"secret-device-owner", b"secret-itunes-tag"):
        assert secret not in stripped_audio

    top_boxes = _parse_box_headers(stripped_audio)
    top_types = [t for t, _ in top_boxes]
    assert b"meta" not in top_types
    assert b"udta" not in top_types
    assert b"free" in top_types

    moov_payload = dict(top_boxes)[b"moov"]
    moov_children = _parse_box_headers(moov_payload)
    moov_types = [t for t, _ in moov_children]
    assert b"udta" not in moov_types
    assert b"meta" not in moov_types
    assert moov_types.count(b"free") == 2
    for ctype, cpayload in moov_children:
        if ctype == b"free":
            assert cpayload == b"\x00" * len(cpayload)

    assert len(storage_hook.stored) == 1
    assert storage_hook.stored[0] == ("student-strip", stripped_audio, "audio/m4a")

    # Overlong mvhd v1 (> 30s), overlong client duration_ms, and corrupt M4A boxes reject with 422
    overlong_v1 = _make_m4a_bytes(timescale=1000, duration=30_001, mvhd_version=1)
    res_v1 = _request(
        app,
        "POST",
        "/api/v1/capture/voice",
        json={
            "audio_base64": base64.b64encode(overlong_v1).decode("ascii"),
            "mime_type": "audio/m4a",
        },
    )
    assert res_v1.status_code == 422
    assert res_v1.json()["error"]["code"] == "VOICE_DURATION_EXCEEDED"

    res_hint = _request(
        app,
        "POST",
        "/api/v1/capture/voice",
        json={
            "audio_base64": base64.b64encode(_make_m4a_bytes(duration=4000)).decode("ascii"),
            "mime_type": "audio/m4a",
            "duration_ms": 30_001,
        },
    )
    assert res_hint.status_code == 422
    assert res_hint.json()["error"]["code"] == "VOICE_DURATION_EXCEEDED"

    ftyp_only = _box(b"ftyp", b"M4A \x00\x00\x00\x00M4A ")
    truncated = ftyp_only + b"\x00\x00\x00\x20moov"
    for corrupt in (ftyp_only, truncated):
        res_corrupt = _request(
            app,
            "POST",
            "/api/v1/capture/voice",
            json={
                "audio_base64": base64.b64encode(corrupt).decode("ascii"),
                "mime_type": "audio/m4a",
            },
        )
        assert res_corrupt.status_code == 422
        assert res_corrupt.json()["error"]["code"] == "VOICE_INVALID_AUDIO"


def test_voice_quota_enforces_user_and_service_limits_in_hcm_date_after_audio_validation():
    now_utc = dt.datetime(2026, 11, 28, 16, 55, tzinfo=dt.timezone.utc)  # 23:55 +07:00 on Nov 28
    fake_parser = _FakeVoiceParser({"recognized_text": "Phở 40k", "amount": 40000})
    tracker = VoiceQuotaTracker(clock=lambda: now_utc)
    app = create_app(
        auth_config=AuthConfig(
            supabase_url="https://proj.supabase.co",
            jwt_secret=TEST_SECRET,
            local_dev_auth=False,
        ),
        voice_parser=fake_parser,
        voice_quota_tracker=tracker,
    )

    valid_payload = {
        "audio_base64": base64.b64encode(_make_m4a_bytes()).decode("ascii"),
        "mime_type": "audio/m4a",
    }
    headers_a = {"Authorization": f"Bearer {_make_token('student-a')}"}
    headers_b = {"Authorization": f"Bearer {_make_token('student-b')}"}

    # Audio validation runs BEFORE quota: invalid requests must not burn Student A's quota.
    bad_audio = _request(
        app,
        "POST",
        "/api/v1/capture/voice",
        json={"audio_base64": "bad!!", "mime_type": "audio/m4a"},
        headers=headers_a,
    )
    assert bad_audio.status_code == 422

    for _ in range(10):
        res = _request(
            app, "POST", "/api/v1/capture/voice", json=valid_payload, headers=headers_a
        )
        assert res.status_code == 200

    # 11th request for Student A fails with 429 before parser is called
    calls_before_limit = len(fake_parser.calls)
    limited_a = _request(
        app, "POST", "/api/v1/capture/voice", json=valid_payload, headers=headers_a
    )
    assert limited_a.status_code == 429
    assert limited_a.json()["error"]["code"] == "VOICE_RATE_LIMITED"
    assert len(fake_parser.calls) == calls_before_limit

    # Student B remains isolated and succeeds
    ok_b = _request(
        app, "POST", "/api/v1/capture/voice", json=valid_payload, headers=headers_b
    )
    assert ok_b.status_code == 200

    # Advancing clock past 17:00 UTC crosses 00:00 Asia/Ho_Chi_Minh -> Nov 29 resets quota
    now_utc = dt.datetime(2026, 11, 28, 17, 5, tzinfo=dt.timezone.utc)
    reset_a = _request(
        app, "POST", "/api/v1/capture/voice", json=valid_payload, headers=headers_a
    )
    assert reset_a.status_code == 200

    # Service-wide daily cap blocks all users once reached
    service_tracker = VoiceQuotaTracker(
        per_user_daily_limit=10,
        service_daily_limit=2,
        clock=lambda: now_utc,
    )
    service_app = create_app(
        auth_config=AuthConfig(
            supabase_url="https://proj.supabase.co",
            jwt_secret=TEST_SECRET,
            local_dev_auth=False,
        ),
        voice_parser=fake_parser,
        voice_quota_tracker=service_tracker,
    )
    assert _request(service_app, "POST", "/api/v1/capture/voice", json=valid_payload, headers=headers_a).status_code == 200
    assert _request(service_app, "POST", "/api/v1/capture/voice", json=valid_payload, headers=headers_b).status_code == 200
    service_limited = _request(
        service_app,
        "POST",
        "/api/v1/capture/voice",
        json=valid_payload,
        headers={"Authorization": f"Bearer {_make_token('student-c')}"},
    )
    assert service_limited.status_code == 429
    assert service_limited.json()["error"]["code"] == "VOICE_RATE_LIMITED"


def test_voice_quota_tracker_is_thread_safe_under_concurrent_consume():
    tracker = VoiceQuotaTracker(
        per_user_daily_limit=5,
        service_daily_limit=100,
        clock=lambda: dt.datetime(2026, 11, 28, 10, 0, tzinfo=dt.timezone.utc),
    )

    def attempt(_idx: int) -> bool:
        try:
            tracker.consume("concurrent-student")
            return True
        except ApiHttpError as exc:
            assert exc.status_code == 429
            assert exc.code == "VOICE_RATE_LIMITED"
            return False

    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(attempt, range(20)))
    assert sum(1 for r in results if r) == 5


class _TimeoutParser:
    def __init__(self, exc: BaseException) -> None:
        self._exc = exc

    async def parse(self, audio_bytes: bytes, mime_type: str, *, duration_ms: int | None = None):
        raise self._exc


@pytest.mark.parametrize("exc", [TimeoutError("timed out"), asyncio.TimeoutError("async timeout")])
def test_voice_capture_maps_parser_timeout_to_504_without_calling_storage(exc: BaseException):
    storage_hook = _RecordingStorageHook()
    app = create_app(
        auth_config=AuthConfig(local_dev_auth=True),
        voice_parser=_TimeoutParser(exc),
        voice_storage_hook=storage_hook,
    )
    res = _request(
        app,
        "POST",
        "/api/v1/capture/voice",
        json={
            "audio_base64": base64.b64encode(_make_m4a_bytes()).decode("ascii"),
            "mime_type": "audio/m4a",
        },
    )
    assert res.status_code == 504
    assert res.json()["error"]["code"] == "VOICE_TIMEOUT"
    assert storage_hook.stored == []


@pytest.mark.parametrize(
    ("raw_text", "expected_vnd"),
    [
        ("35k", 35_000),
        ("35.5k", 35_500),
        ("35k5", 35_500),
        ("ba mươi lăm nghìn", 35_000),
        ("một triệu hai", 1_200_000),
        ("1tr250", 1_250_000),
        ("hai trăm năm mươi nghìn", 250_000),
        ("mười lăm nghìn năm trăm đồng", 15_500),
        ("500.000 đ", 500_000),
        ("1", 1),
        ("1000000000000", 1_000_000_000_000),
    ],
)
def test_parse_vietnamese_amount_handles_shorthand_words_and_bounds(
    raw_text: str, expected_vnd: int
):
    assert parse_vietnamese_amount(raw_text) == expected_vnd


def test_parse_vietnamese_amount_rejects_out_of_bounds_and_non_integer_values():
    for invalid in (0, -500, 1_000_000_000_001, True, 35.5, "0", "2000000000000"):
        assert parse_vietnamese_amount(invalid) is None


def test_normalize_voice_draft_resolves_hcm_relative_dates_and_timestamps():
    # 2026-11-28 17:30 UTC == 2026-11-29 00:30 +07:00 in Asia/Ho_Chi_Minh
    now_utc = dt.datetime(2026, 11, 28, 17, 30, tzinfo=dt.timezone.utc)

    yesterday = normalize_voice_draft(
        {
            "recognized_text": "hôm qua đi xe hết 20 nghìn",
            "amount": "20 nghìn",
            "category": "transport",
        },
        now=now_utc,
    )
    assert yesterday.amount == 20_000
    assert yesterday.currency == "VND"
    assert yesterday.category == "transport"
    assert yesterday.occurred_on == dt.date(2026, 11, 28)
    assert yesterday.timestamp is None
    assert yesterday.has_low_confidence is False

    two_days_ago = normalize_voice_draft(
        {"recognized_text": "hôm kia ăn bún 45k", "category": "food"},
        now=now_utc,
    )
    assert two_days_ago.amount == 45_000
    assert two_days_ago.occurred_on == dt.date(2026, 11, 27)
    assert two_days_ago.timestamp is None

    with_clock_time = normalize_voice_draft(
        {
            "recognized_text": "sáng nay 8h30 uống cà phê 25k",
            "amount": "25k",
            "category": "food",
        },
        now=now_utc,
    )
    assert with_clock_time.occurred_on == dt.date(2026, 11, 29)
    assert with_clock_time.timestamp is not None
    assert with_clock_time.timestamp.utcoffset() == dt.timedelta(hours=7)
    assert with_clock_time.timestamp.hour == 8
    assert with_clock_time.timestamp.minute == 30


@pytest.mark.parametrize(
    "raw_payload",
    [
        {"recognized_text": "không mua cà phê", "amount": 25000, "category": "food"},
        {"recognized_text": "chưa trả tiền cơm 35k", "amount": "35k", "category": "food"},
        {"recognized_text": "   ", "amount": None},
        {"recognized_text": "[silence]", "amount": 10000},
        {
            "recognized_text": "Cơm sườn 35k với trà sữa 25k",
            "amount": 60000,
            "category": "food",
        },
        {"recognized_text": "mua cà phê sáng", "amount": None, "category": "food"},
        {"recognized_text": "Cà phê 0 đồng", "amount": 0, "category": "food"},
    ],
)
def test_voice_capture_http_forces_unresolved_draft_on_negation_silence_multi_or_missing_amount(
    raw_payload: dict,
):
    repo = InMemoryRepository()
    app = create_app(
        auth_config=AuthConfig(local_dev_auth=True, local_dev_user_id="student-norm"),
        repository=repo,
        voice_parser=_FakeVoiceParser(raw_payload),
    )
    res = _request(
        app,
        "POST",
        "/api/v1/capture/voice",
        json={
            "audio_base64": base64.b64encode(_make_m4a_bytes()).decode("ascii"),
            "mime_type": "audio/m4a",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["amount"] is None
    assert body["currency"] is None
    assert "amount" in body["uncertain_fields"]
    assert body["has_low_confidence"] is True
    assert repo.list_transactions("student-norm") == []


def test_voice_capture_http_preserves_legitimate_khong_duong_and_normalizes_shorthand():
    app = create_app(
        auth_config=AuthConfig(local_dev_auth=True),
        voice_parser=_FakeVoiceParser(
            {
                "recognized_text": "trà sữa không đường ba mươi lăm nghìn",
                "amount": "ba mươi lăm nghìn",
                "category": "food",
            }
        ),
    )
    res = _request(
        app,
        "POST",
        "/v1/captures/voice",
        json={
            "audio_base64": base64.b64encode(_make_m4a_bytes()).decode("ascii"),
            "mime_type": "audio/m4a",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["amount"] == 35_000
    assert body["currency"] == "VND"
    assert body["has_low_confidence"] is False


def test_normalize_voice_draft_maps_vietnamese_category_and_flags_unknown_category():
    mapped = normalize_voice_draft(
        {"recognized_text": "Cơm sườn 35k", "amount": 35_000, "category": "Ăn uống"}
    )
    assert mapped.category == "food"
    assert mapped.has_low_confidence is False

    invalid_cat = normalize_voice_draft(
        {"recognized_text": "Mua gì đó 35k", "amount": 35_000, "category": "crypto"}
    )
    assert invalid_cat.category is None
    assert "category" in invalid_cat.uncertain_fields
    assert invalid_cat.has_low_confidence is True


def test_voice_capture_enforces_wav_container_duration_when_duration_ms_omitted():
    fake_parser = _FakeVoiceParser({"recognized_text": "Cà phê 25k", "amount": 25000})
    app = create_app(
        auth_config=AuthConfig(local_dev_auth=True),
        voice_parser=fake_parser,
    )

    valid_wav = make_wav_bytes(duration_ms=2500, extra_chunks=b"LIST\x03\x00\x00\x00abc\x00")
    ok_res = _request(
        app,
        "POST",
        "/api/v1/capture/voice",
        json={
            "audio_base64": base64.b64encode(valid_wav).decode("ascii"),
            "mime_type": "audio/wav",
        },
    )
    assert ok_res.status_code == 200
    assert fake_parser.calls[-1][2] == 2500

    overlong_wav = make_wav_bytes(duration_ms=30_001)
    too_long_res = _request(
        app,
        "POST",
        "/api/v1/capture/voice",
        json={
            "audio_base64": base64.b64encode(overlong_wav).decode("ascii"),
            "mime_type": "audio/wav",
        },
    )
    assert too_long_res.status_code == 422
    assert too_long_res.json()["error"]["code"] == "VOICE_DURATION_EXCEEDED"
    assert len(fake_parser.calls) == 1
