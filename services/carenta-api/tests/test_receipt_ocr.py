import asyncio
import base64
import datetime as dt
import json
from io import BytesIO

import httpx
import pytest
from PIL import Image, PngImagePlugin

import app.receipt_ocr as ocr
from app.auth import AuthConfig
from app.errors import ApiHttpError
from app.main import create_app
from app.receipt_ocr import MAX_REQUEST_BYTES, GeminiReceiptExtractor, ReceiptOcrDraft
from app.repository import InMemoryRepository


def draft_fields(document_type="receipt"):
    return {
        "document_type": document_type,
        "amount": 35_000,
        "currency": "VND",
        "merchant": "Quán ăn mẫu" if document_type == "receipt" else None,
        "description": "Bữa trưa",
        "category": "food",
        "occurred_on": "2026-11-26",
        "timestamp": None,
        "confidence": {"amount": 0.9, "merchant": 0.8, "description": 0.8, "category": 0.7, "timestamp": 0},
    }


def fixture_image(image_format):
    with BytesIO() as buffer:
        image = Image.new("RGB", (96, 64), "white")
        if image_format == "PNG":
            metadata = PngImagePlugin.PngInfo()
            metadata.add_text("Note", "synthetic metadata")
            image.save(buffer, format=image_format, pnginfo=metadata)
        else:
            exif = Image.Exif()
            exif[270] = "synthetic metadata"
            image.save(buffer, format=image_format, exif=exif)
        return base64.b64encode(buffer.getvalue()).decode("ascii")


def request(application, method, path, **kwargs):
    async def send():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=application), base_url="http://test",
        ) as client:
            return await client.request(method, path, **kwargs)

    return asyncio.run(send())


@pytest.mark.parametrize(("image_format", "document_type", "path"), [
    ("JPEG", "receipt", "/api/v1/capture/ocr"),
    ("PNG", "bank_transfer", "/v1/captures/receipt"),
])
def test_extraction_returns_an_unsaved_draft(image_format, document_type, path):
    async def extract(clean):
        with Image.open(BytesIO(clean)) as photo:
            assert photo.format == "JPEG"
            assert photo.size == (96, 64)
            assert not photo.getexif()
            assert b"synthetic metadata" not in clean
        return ReceiptOcrDraft.model_validate(draft_fields(document_type))

    application = create_app(
        auth_config=AuthConfig(local_dev_auth=True),
        receipt_extractor=extract,
        repository=InMemoryRepository(),
    )
    response = request(application, "POST", path, json={"image_base64": fixture_image(image_format)})

    assert response.status_code == 200, response.text
    assert response.headers["Cache-Control"] == "no-store"
    assert response.json() == draft_fields(document_type)
    ledger = request(application, "GET", "/v1/transactions")
    assert ledger.status_code == 200
    assert ledger.json()["total"] == 0


def test_auth_and_upload_validation_precede_gemini():
    async def extract(_image):
        pytest.fail("Invalid uploads must not reach Gemini")

    protected = create_app(auth_config=AuthConfig(), receipt_extractor=extract)
    response = request(protected, "POST", "/api/v1/capture/ocr", json={"image_base64": "bad"})
    assert response.status_code == 401

    local = create_app(auth_config=AuthConfig(local_dev_auth=True), receipt_extractor=extract)
    path = "/api/v1/capture/ocr"
    invalid = request(local, "POST", path, json={"image_base64": "not an image"})
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "OCR_INVALID_IMAGE"
    oversized = request(local, "POST", path, json={"image_base64": "x" * MAX_REQUEST_BYTES})
    assert oversized.status_code == 413
    assert oversized.json()["error"]["code"] == "OCR_IMAGE_TOO_LARGE"


def test_gemini_json_schema_request_and_missing_field_score():
    final = draft_fields("bank_transfer")

    def answer(provider_request):
        payload = json.loads(provider_request.content)
        assert provider_request.url.path == "/v1beta/interactions"
        assert provider_request.headers["api-revision"] == "2026-05-20"
        assert payload["store"] is False
        assert payload["input"][1]["mime_type"] == "image/jpeg"
        assert payload["response_format"]["schema"]["required"] == list(final)
        return httpx.Response(200, json={
            "status": "completed",
            "steps": [{"type": "model_output", "content": [{"type": "text", "text": json.dumps(final)}]}],
        })

    extract = GeminiReceiptExtractor("test-key", "test-model", transport=httpx.MockTransport(answer))
    draft = asyncio.run(extract(b"sanitized test bytes"))
    assert draft.amount == 35_000
    assert draft.merchant is None and draft.confidence.merchant == 0
    assert draft.occurred_on.isoformat() == "2026-11-26" and draft.timestamp is None


@pytest.mark.parametrize(("status", "response_body", "expected_status", "error_code"), [
    (429, {}, 503, "OCR_UNAVAILABLE"),
    (200, {"status": "completed", "steps": []}, 502, "OCR_INVALID_RESULT"),
])
def test_provider_failure_has_a_safe_error(status, response_body, expected_status, error_code):
    provider = GeminiReceiptExtractor(
        "test-key", "test-model", transport=httpx.MockTransport(lambda _: httpx.Response(status, json=response_body)),
    )
    application = create_app(auth_config=AuthConfig(local_dev_auth=True), receipt_extractor=provider)
    response = request(application, "POST", "/api/v1/capture/ocr", json={"image_base64": fixture_image("PNG")})
    assert response.status_code == expected_status
    assert response.json()["error"]["code"] == error_code
    assert "test-key" not in response.text


def test_daily_limits_share_all_route_aliases_and_reset_on_the_next_day(monkeypatch):
    day = dt.date(2026, 11, 28)
    monkeypatch.setattr(ocr, "get_current_date", lambda: day)
    monkeypatch.setattr(ocr, "OCR_DAILY_USER_LIMIT", 2)
    calls = []

    async def extract(_image):
        calls.append(True)
        return ReceiptOcrDraft.model_validate(draft_fields())

    application = create_app(auth_config=AuthConfig(local_dev_auth=True), receipt_extractor=extract)
    upload = {"image_base64": fixture_image("JPEG")}
    assert request(application, "POST", "/api/v1/capture/ocr", json=upload).status_code == 200
    assert request(application, "POST", "/v1/captures/receipt", json=upload).status_code == 200
    limited = request(application, "POST", "/api/v1/captures/receipt", json=upload)
    assert limited.status_code == 429
    assert limited.json()["error"]["code"] == "OCR_RATE_LIMITED"
    assert len(calls) == 2
    day += dt.timedelta(days=1)
    assert request(application, "POST", "/api/v1/capture/ocr", json=upload).status_code == 200
    assert len(calls) == 3


def test_quota_is_per_student_with_a_shared_service_ceiling(monkeypatch):
    monkeypatch.setattr(ocr, "OCR_DAILY_USER_LIMIT", 1)
    monkeypatch.setattr(ocr, "OCR_DAILY_SERVICE_LIMIT", 2)
    quota = ocr.DailyOcrQuota()
    quota.reserve("student-a")
    with pytest.raises(ApiHttpError, match="daily image extraction limit"):
        quota.reserve("student-a")
    quota.reserve("student-b")
    with pytest.raises(ApiHttpError, match="daily image extraction limit"):
        quota.reserve("student-c")


def test_transparent_png_is_composited_on_white():
    with BytesIO() as buffer:
        Image.new("RGBA", (64, 64), (0, 0, 0, 0)).save(buffer, format="PNG")
        encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    with Image.open(BytesIO(ocr.prepare_receipt_image(encoded))) as clean:
        assert clean.getpixel((0, 0)) == (255, 255, 255)


def test_provider_empty_merchant_and_note_become_unknown():
    fields = {**draft_fields(), "merchant": "", "description": "  "}
    draft = ReceiptOcrDraft.model_validate(fields)
    assert draft.merchant is None and draft.description is None
