"""Upload validation and metadata stripping for receipts and voice clips (#52)."""

from __future__ import annotations

import hashlib

import pytest

from app.media import (
    RECEIPT_MAX_BYTES,
    VOICE_MAX_BYTES,
    MediaValidationError,
    sanitize_media,
)
from media_samples import GPS_MARKER, jpeg, m4a, png


def _code(kind, data, declared=None) -> str:
    with pytest.raises(MediaValidationError) as exc:
        sanitize_media(kind, data, declared)
    return exc.value.code


def test_jpeg_metadata_is_stripped_and_structure_kept():
    result = sanitize_media("receipt", jpeg(trailer=b"appended-junk"), "image/jpeg")
    assert result.mime_type == "image/jpeg" and result.extension == "jpg"
    assert (result.width, result.height) == (640, 480)
    assert GPS_MARKER not in result.data
    assert b"Exif" not in result.data and b"xmpmeta" not in result.data
    assert b"appended-junk" not in result.data
    assert b"JFIF" in result.data and b"ICC_PROFILE" in result.data  # colour handling kept
    assert result.data.startswith(b"\xff\xd8") and result.data.endswith(b"\xff\xd9")
    assert result.sha256 == hashlib.sha256(result.data).hexdigest()
    # Sanitizing again is a no-op.
    assert sanitize_media("receipt", result.data).data == result.data


def test_png_text_exif_and_time_chunks_are_stripped():
    result = sanitize_media("receipt", png(trailer=b"junk"), "image/png")
    assert (result.width, result.height) == (640, 480)
    for chunk in (b"tEXt", b"eXIf", b"tIME", GPS_MARKER, b"junk"):
        assert chunk not in result.data
    assert b"IDAT" in result.data and result.data.endswith(b"IEND\xaeB`\x82")


def test_m4a_metadata_is_blanked_without_moving_audio():
    original = m4a(duration_ms=12_500)
    result = sanitize_media("voice", original, "audio/x-m4a")
    assert result.mime_type == "audio/mp4" and result.extension == "m4a"
    assert result.duration_ms == 12_500
    assert GPS_MARKER not in result.data
    assert len(result.data) == len(original)  # boxes overwritten in place, offsets unchanged
    assert result.data.index(b"mdat") == original.index(b"mdat")


def test_m4a_64bit_mvhd_and_30_second_cap():
    assert sanitize_media("voice", m4a(30_000, mvhd_version=1)).duration_ms == 30_000
    assert sanitize_media("voice", m4a(30_400)).duration_ms == 30_400  # recorder overshoot
    assert _code("voice", m4a(31_000)) == "MEDIA_TOO_LONG"


@pytest.mark.parametrize(
    ("kind", "data", "declared", "code"),
    [
        ("receipt", b"", None, "MEDIA_EMPTY"),
        ("receipt", b"GIF89a" + bytes(100), None, "MEDIA_UNSUPPORTED_TYPE"),
        ("receipt", m4a(), None, "MEDIA_UNSUPPORTED_TYPE"),  # audio sent as receipt
        ("voice", jpeg(), None, "MEDIA_UNSUPPORTED_TYPE"),  # image sent as voice
        ("voice", m4a(brand=b"qt  ", compatible=b"qt  "), None, "MEDIA_UNSUPPORTED_TYPE"),
        ("receipt", png(), "image/jpeg", "MEDIA_TYPE_MISMATCH"),
        ("receipt", jpeg(), "application/pdf", "MEDIA_TYPE_MISMATCH"),
        ("voice", m4a(), "video/mp4", "MEDIA_TYPE_MISMATCH"),
        ("receipt", jpeg()[:-40], None, "MEDIA_CORRUPT"),
        ("receipt", png(bad_crc=True), None, "MEDIA_CORRUPT"),
        ("receipt", png()[:-12], None, "MEDIA_CORRUPT"),
        ("voice", m4a()[:-100], None, "MEDIA_CORRUPT"),
        ("receipt", jpeg(16, 16), None, "MEDIA_DIMENSIONS"),
        ("receipt", png(12_000, 100), None, "MEDIA_DIMENSIONS"),
        ("receipt", png(9_000, 9_000), None, "MEDIA_DIMENSIONS"),  # decompression-bomb pixel cap
    ],
)
def test_rejections(kind, data, declared, code):
    assert _code(kind, data, declared) == code


def test_size_limits_are_checked_before_parsing():
    assert _code("receipt", jpeg() + bytes(RECEIPT_MAX_BYTES)) == "MEDIA_TOO_LARGE"
    assert _code("voice", m4a() + bytes(VOICE_MAX_BYTES)) == "MEDIA_TOO_LARGE"


def test_declared_type_parameters_and_aliases_are_accepted():
    assert sanitize_media("receipt", jpeg(), "image/jpg").mime_type == "image/jpeg"
    assert sanitize_media("receipt", jpeg(), "IMAGE/JPEG; charset=binary").mime_type == "image/jpeg"


def test_error_messages_are_safe_to_show():
    with pytest.raises(MediaValidationError) as exc:
        sanitize_media("receipt", b"\x00" * 10, "image/png")
    assert exc.value.message == "Expected a JPEG or PNG image."
