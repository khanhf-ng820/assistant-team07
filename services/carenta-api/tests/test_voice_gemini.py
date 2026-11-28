"""Isolated unit and FastAPI-lifespan tests for Gemini Voice Capture (#114 / Spec #111)."""

from __future__ import annotations

import asyncio
import base64
import datetime as dt
import json
from typing import Any

import pytest
from fastapi.testclient import TestClient
from google.genai import errors as genai_errors, types
import httpx2
from pydantic import SecretStr

from app.auth import AuthConfig
from app.errors import ApiHttpError
from app.main import create_app
from app.settings import GeminiSettings
from app.voice_capture import VoiceCaptureDraft, VoiceParserProtocol
from app.voice_gemini import GeminiVoiceParser, build_gemini_client
from tests.voice_test_helpers import make_m4a_bytes


def _make_response(
    payload: dict[str, Any] | str,
    *,
    finish_reason: types.FinishReason = types.FinishReason.STOP,
) -> types.GenerateContentResponse:
    raw_text = payload if isinstance(payload, str) else json.dumps(payload, ensure_ascii=False)
    return types.GenerateContentResponse(
        candidates=[
            types.Candidate(
                content=types.Content(
                    role="model",
                    parts=[types.Part.from_text(text=raw_text)],
                ),
                finish_reason=finish_reason,
            )
        ]
    )


class _FakeAsyncModels:
    def __init__(self, handler) -> None:
        self._handler = handler
        self.calls: list[dict[str, Any]] = []

    async def generate_content(
        self,
        *,
        model: str,
        contents: list[Any],
        config: types.GenerateContentConfig,
    ) -> types.GenerateContentResponse:
        self.calls.append({"model": model, "contents": contents, "config": config})
        return await self._handler(model=model, contents=contents, config=config)


class _FakeAioClient:
    def __init__(self, handler) -> None:
        self.models = _FakeAsyncModels(handler)
        self.aclose_calls = 0

    async def aclose(self) -> None:
        self.aclose_calls += 1


class _FakeGenAIClient:
    def __init__(self, handler) -> None:
        self.aio = _FakeAioClient(handler)
        self.close_calls = 0
        self.files = _ForbiddenFilesNamespace()

    def close(self) -> None:
        self.close_calls += 1


class _ForbiddenFilesNamespace:
    def upload(self, *_args: Any, **_kwargs: Any) -> Any:
        raise AssertionError("Gemini Files API must never be called for Voice Capture")


def test_build_gemini_client_configures_ms_timeout_and_retry_options(
    monkeypatch: pytest.MonkeyPatch,
):
    captured: dict[str, Any] = {}

    class _RecordingClient:
        def __init__(self, *, api_key: str | None = None, http_options: Any = None, **kwargs: Any):
            captured["api_key"] = api_key
            captured["http_options"] = http_options
            captured["kwargs"] = kwargs

    monkeypatch.setattr("app.voice_gemini.genai.Client", _RecordingClient)
    settings = GeminiSettings(
        api_key=SecretStr("AIza-secret-test-value"),
        model="gemini-3.5-flash-lite",
        timeout_ms=20_000,
    )

    build_gemini_client(settings)

    assert captured["api_key"] == "AIza-secret-test-value"
    http_opts = captured["http_options"]
    assert isinstance(http_opts, types.HttpOptions)
    assert http_opts.timeout == 20_000
    assert http_opts.retry_options is not None
    assert http_opts.retry_options.attempts == 2
    assert http_opts.retry_options.initial_delay == 0.5
    assert http_opts.retry_options.max_delay == 3.0
    assert http_opts.retry_options.http_status_codes == [408, 429, 500, 502, 503, 504]


def test_gemini_voice_parser_uses_inline_part_and_async_generate_content():
    async def handler(**_kwargs: Any) -> types.GenerateContentResponse:
        return _make_response(
            {
                "amount": 35000,
                "currency": "VND",
                "category": "food",
                "merchant": "Quán Cơm Sườn",
                "description": "Cơm sườn 35k",
                "recognized_text": "Cơm sườn 35k",
                "occurred_on": "2026-11-28",
                "timestamp": None,
                "uncertain_fields": [],
                "has_low_confidence": False,
            }
        )

    fake_client = _FakeGenAIClient(handler)
    fixed_now = dt.datetime(2026, 11, 28, 12, 15, tzinfo=dt.timezone(dt.timedelta(hours=7)))
    parser: VoiceParserProtocol = GeminiVoiceParser(
        client=fake_client,
        model="gemini-3.5-flash-lite",
        clock=lambda: fixed_now,
    )

    audio_bytes = b"\x00\x00\x00\x18ftypM4A "
    draft = asyncio.run(parser.parse(audio_bytes, "audio/m4a", duration_ms=3500))

    assert isinstance(draft, VoiceCaptureDraft)
    assert draft.amount == 35_000
    assert draft.currency == "VND"
    assert draft.category == "food"
    assert draft.recognized_text == "Cơm sườn 35k"
    assert draft.occurred_on == dt.date(2026, 11, 28)
    assert draft.has_low_confidence is False

    assert len(fake_client.aio.models.calls) == 1
    call = fake_client.aio.models.calls[0]
    assert call["model"] == "gemini-3.5-flash-lite"

    prompt, part = call["contents"]
    assert isinstance(prompt, str)
    assert "Asia/Ho_Chi_Minh" in prompt
    assert "2026-11-28" in prompt
    for category in ("food", "transport", "shopping", "bills", "education", "entertainment", "other"):
        assert category in prompt

    assert isinstance(part, types.Part)
    assert part.inline_data is not None
    assert part.inline_data.data == audio_bytes
    assert part.inline_data.mime_type == "audio/m4a"

    config = call["config"]
    assert isinstance(config, types.GenerateContentConfig)
    assert config.response_mime_type == "application/json"
    assert config.response_schema is VoiceCaptureDraft
    assert config.temperature == 0


@pytest.mark.parametrize(
    ("raw_payload", "expected"),
    [
        (
            {
                "recognized_text": "Cơm sườn 35k",
                "amount": "35k",
                "category": "food",
            },
            {
                "amount": 35_000,
                "currency": "VND",
                "category": "food",
                "has_low_confidence": False,
                "uncertain_fields": [],
            },
        ),
        (
            {
                "recognized_text": "trà sữa ba mươi lăm nghìn",
                "amount": "ba mươi lăm nghìn",
                "category": "food",
            },
            {
                "amount": 35_000,
                "currency": "VND",
                "category": "food",
                "has_low_confidence": False,
                "uncertain_fields": [],
            },
        ),
        (
            {
                "recognized_text": "một triệu hai",
                "amount": "một triệu hai",
                "category": "shopping",
            },
            {
                "amount": 1_200_000,
                "currency": "VND",
                "category": "shopping",
                "has_low_confidence": False,
                "uncertain_fields": [],
            },
        ),
        (
            {
                "recognized_text": "không mua cà phê",
                "amount": 25_000,
                "category": "food",
            },
            {
                "amount": None,
                "currency": None,
                "category": "food",
                "has_low_confidence": True,
                "uncertain_fields": ["amount"],
            },
        ),
        (
            {
                "recognized_text": "uống cà phê sáng",
                "amount": None,
                "category": "food",
            },
            {
                "amount": None,
                "currency": None,
                "category": "food",
                "has_low_confidence": True,
                "uncertain_fields": ["amount"],
            },
        ),
        (
            {
                "recognized_text": "Mua gì đó 35k",
                "amount": 35_000,
                "category": "crypto",
            },
            {
                "amount": 35_000,
                "currency": "VND",
                "category": None,
                "has_low_confidence": True,
                "uncertain_fields": ["category"],
            },
        ),
    ],
)
def test_gemini_voice_parser_normalizes_vietnamese_edge_cases(
    raw_payload: dict[str, Any], expected: dict[str, Any]
):
    async def handler(**_kwargs: Any) -> types.GenerateContentResponse:
        return _make_response(raw_payload)

    parser = GeminiVoiceParser(
        client=_FakeGenAIClient(handler),
        clock=lambda: dt.datetime(2026, 11, 28, 12, 0, tzinfo=dt.timezone(dt.timedelta(hours=7))),
    )
    draft = asyncio.run(parser.parse(b"\x00\x00\x00\x18ftypM4A ", "audio/m4a"))

    assert draft.amount == expected["amount"]
    assert draft.currency == expected["currency"]
    assert draft.category == expected["category"]
    assert draft.has_low_confidence is expected["has_low_confidence"]
    assert draft.uncertain_fields == expected["uncertain_fields"]


def test_gemini_voice_parser_resolves_relative_dates_in_ho_chi_minh_timezone():
    # 2026-11-28 17:30 UTC == 2026-11-29 00:30 +07:00 in Asia/Ho_Chi_Minh
    now_utc = dt.datetime(2026, 11, 28, 17, 30, tzinfo=dt.timezone.utc)

    async def handler(**_kwargs: Any) -> types.GenerateContentResponse:
        return _make_response(
            {
                "recognized_text": "hôm qua đi xe hết 20 nghìn",
                "amount": "20 nghìn",
                "category": "transport",
                "occurred_on": None,
                "timestamp": None,
            }
        )

    parser = GeminiVoiceParser(client=_FakeGenAIClient(handler), clock=lambda: now_utc)
    draft = asyncio.run(parser.parse(b"\x00\x00\x00\x18ftypM4A ", "audio/m4a"))

    assert draft.amount == 20_000
    assert draft.currency == "VND"
    assert draft.category == "transport"
    assert draft.occurred_on == dt.date(2026, 11, 28)
    assert draft.timestamp is None
    assert draft.has_low_confidence is False


@pytest.mark.parametrize(
    "response",
    [
        types.GenerateContentResponse(candidates=[]),
        types.GenerateContentResponse(candidates=None),
        _make_response(
            {"recognized_text": "Cơm sườn 35k", "amount": 35_000, "category": "food"},
            finish_reason=types.FinishReason.SAFETY,
        ),
        _make_response(
            {"recognized_text": "Cơm sườn 35k", "amount": 35_000, "category": "food"},
            finish_reason=types.FinishReason.PROHIBITED_CONTENT,
        ),
        _make_response("   "),
    ],
)
def test_gemini_voice_parser_returns_safe_unresolved_draft_on_empty_or_safety_blocked_candidate(
    response: types.GenerateContentResponse,
):
    async def handler(**_kwargs: Any) -> types.GenerateContentResponse:
        return response

    parser = GeminiVoiceParser(client=_FakeGenAIClient(handler))
    draft = asyncio.run(parser.parse(b"\x00\x00\x00\x18ftypM4A ", "audio/m4a"))

    assert draft.amount is None
    assert draft.currency is None
    assert draft.has_low_confidence is True
    assert "amount" in draft.uncertain_fields
    assert draft.recognized_text is None


def test_gemini_voice_parser_maps_asyncio_timeout_to_504():
    async def slow_handler(**_kwargs: Any) -> types.GenerateContentResponse:
        await asyncio.sleep(0.2)
        return _make_response({})

    parser = GeminiVoiceParser(
        client=_FakeGenAIClient(slow_handler),
        timeout_seconds=0.01,
    )
    with pytest.raises(ApiHttpError) as exc_info:
        asyncio.run(parser.parse(b"\x00\x00\x00\x18ftypM4A ", "audio/m4a"))

    assert exc_info.value.status_code == 504
    assert exc_info.value.code == "VOICE_TIMEOUT"


@pytest.mark.parametrize(
    ("status_code", "expected_status", "expected_code"),
    [
        (429, 429, "VOICE_RATE_LIMITED"),
        (503, 503, "VOICE_PROVIDER_UNAVAILABLE"),
        (408, 504, "VOICE_TIMEOUT"),
        (504, 504, "VOICE_TIMEOUT"),
        (500, 502, "VOICE_PROVIDER_ERROR"),
        (401, 502, "VOICE_PROVIDER_ERROR"),
    ],
)
def test_gemini_voice_parser_maps_upstream_api_errors_without_leaking_secrets(
    status_code: int,
    expected_status: int,
    expected_code: str,
):
    secret = "AIza-do-not-leak-me"

    async def failing_handler(**_kwargs: Any) -> types.GenerateContentResponse:
        raise genai_errors.APIError(
            status_code,
            {"error": {"message": f"upstream failure key={secret}", "status": "ERROR"}},
        )

    parser = GeminiVoiceParser(client=_FakeGenAIClient(failing_handler))
    with pytest.raises(ApiHttpError) as exc_info:
        asyncio.run(parser.parse(b"\x00\x00\x00\x18ftypM4A ", "audio/m4a"))

    assert exc_info.value.status_code == expected_status
    assert exc_info.value.code == expected_code
    assert secret not in exc_info.value.message


def test_gemini_voice_parser_maps_malformed_json_to_502_without_leaking_payload():
    async def bad_json_handler(**_kwargs: Any) -> types.GenerateContentResponse:
        return _make_response("not-json-AIza-secret")

    parser = GeminiVoiceParser(client=_FakeGenAIClient(bad_json_handler))
    with pytest.raises(ApiHttpError) as exc_info:
        asyncio.run(parser.parse(b"\x00\x00\x00\x18ftypM4A ", "audio/m4a"))

    assert exc_info.value.status_code == 502
    assert exc_info.value.code == "VOICE_PROVIDER_ERROR"
    assert "AIza-secret" not in exc_info.value.message


def test_fastapi_lifespan_binds_gemini_parser_and_closes_client_on_shutdown(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("GEMINI_API_KEY", "AIza-lifespan-secret")
    monkeypatch.setenv("CARENTA_GEMINI_MODEL", "gemini-3.5-flash-lite")

    async def handler(**_kwargs: Any) -> types.GenerateContentResponse:
        return _make_response(
            {
                "recognized_text": "Cơm sườn 35k",
                "amount": 35_000,
                "category": "food",
                "occurred_on": "2026-11-28",
            }
        )

    fake_client = _FakeGenAIClient(handler)
    factory_calls: list[GeminiSettings] = []

    def fake_factory(settings: GeminiSettings) -> _FakeGenAIClient:
        factory_calls.append(settings)
        return fake_client

    monkeypatch.setattr("app.main.build_gemini_client", fake_factory)

    app = create_app(auth_config=AuthConfig(local_dev_auth=True, local_dev_user_id="student-life"))
    assert factory_calls == []

    payload = {
        "audio_base64": base64.b64encode(make_m4a_bytes(duration=3000)).decode("ascii"),
        "mime_type": "audio/m4a",
        "duration_ms": 3000,
    }
    with TestClient(app) as client:
        assert len(factory_calls) == 1
        assert factory_calls[0].api_key.get_secret_value() == "AIza-lifespan-secret"
        assert factory_calls[0].model == "gemini-3.5-flash-lite"

        for route in ("/api/v1/capture/voice", "/v1/captures/voice"):
            res = client.post(route, json=payload)
            assert res.status_code == 200
            assert res.json()["amount"] == 35_000
            assert res.json()["category"] == "food"

        assert len(fake_client.aio.models.calls) == 2
        assert fake_client.aio.aclose_calls == 0
        assert fake_client.close_calls == 0

    assert fake_client.aio.aclose_calls == 1
    assert fake_client.close_calls == 1


def test_fastapi_lifespan_starts_cleanly_without_gemini_key_and_fails_closed(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setattr(
        "app.main.build_gemini_client",
        lambda _settings: pytest.fail("build_gemini_client must not run when GEMINI_API_KEY is unset"),
    )

    app = create_app(auth_config=AuthConfig(local_dev_auth=True))
    payload = {
        "audio_base64": base64.b64encode(make_m4a_bytes(duration=3000)).decode("ascii"),
        "mime_type": "audio/m4a",
    }
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200
        res = client.post("/api/v1/capture/voice", json=payload)
        assert res.status_code == 503
        assert res.json()["error"]["code"] == "VOICE_PARSER_UNAVAILABLE"


def test_fastapi_lifespan_skips_gemini_client_when_voice_parser_injected(
    monkeypatch: pytest.MonkeyPatch,
):
    monkeypatch.setenv("GEMINI_API_KEY", "AIza-lifespan-secret")
    monkeypatch.setattr(
        "app.main.build_gemini_client",
        lambda _settings: pytest.fail("build_gemini_client must not run when voice_parser is injected"),
    )

    class _StubParser:
        async def parse(self, audio_bytes: bytes, mime_type: str, *, duration_ms: int | None = None):
            return {"recognized_text": "Trà đá 5k", "amount": 5000, "category": "food"}

    app = create_app(
        auth_config=AuthConfig(local_dev_auth=True),
        voice_parser=_StubParser(),
    )
    payload = {
        "audio_base64": base64.b64encode(make_m4a_bytes(duration=3000)).decode("ascii"),
        "mime_type": "audio/m4a",
    }
    with TestClient(app) as client:
        res = client.post("/api/v1/capture/voice", json=payload)
        assert res.status_code == 200
        assert res.json()["amount"] == 5000


def test_gemini_voice_parser_maps_httpx2_timeout_and_transport_errors():
    async def timeout_handler(**_kwargs: Any) -> types.GenerateContentResponse:
        raise httpx2.ReadTimeout("socket timed out")

    timeout_parser = GeminiVoiceParser(client=_FakeGenAIClient(timeout_handler))
    with pytest.raises(ApiHttpError) as timeout_exc:
        asyncio.run(timeout_parser.parse(b"\x00\x00\x00\x18ftypM4A ", "audio/m4a"))
    assert timeout_exc.value.status_code == 504
    assert timeout_exc.value.code == "VOICE_TIMEOUT"

    async def transport_handler(**_kwargs: Any) -> types.GenerateContentResponse:
        raise httpx2.ConnectError("dns failure AIza-secret")

    transport_parser = GeminiVoiceParser(client=_FakeGenAIClient(transport_handler))
    with pytest.raises(ApiHttpError) as transport_exc:
        asyncio.run(transport_parser.parse(b"\x00\x00\x00\x18ftypM4A ", "audio/m4a"))
    assert transport_exc.value.status_code == 502
    assert transport_exc.value.code == "VOICE_PROVIDER_ERROR"
    assert "AIza-secret" not in transport_exc.value.message
