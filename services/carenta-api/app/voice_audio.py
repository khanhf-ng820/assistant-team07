"""Voice audio payload decoding, validation, and in-memory metadata stripping."""

from __future__ import annotations

import base64
import binascii
from dataclasses import dataclass

from app.errors import ApiHttpError

MAX_VOICE_AUDIO_BYTES = 2 * 1024 * 1024
MAX_VOICE_DURATION_MS = 30_000
_MAX_BASE64_DECODE_CHARS = 8 * 1024 * 1024

VOICE_MIME_ALIASES: dict[str, str] = {
    "audio/x-m4a": "audio/m4a",
    "audio/x-aac": "audio/aac",
}

ALLOWED_VOICE_MIME_TYPES: frozenset[str] = frozenset(
    {
        "audio/m4a",
        "audio/mp4",
        "audio/aac",
        "audio/wav",
        "audio/webm",
        "audio/mpeg",
        "audio/ogg",
    }
)

_ISOBMFF_MIME_TYPES = frozenset({"audio/m4a", "audio/mp4"})
_STRIPPABLE_BOX_TYPES = frozenset({b"udta", b"meta"})


@dataclass(frozen=True)
class ValidatedVoiceAudio:
    """Validated audio bytes and canonical MIME type after in-memory sanitization."""

    audio_bytes: bytes
    mime_type: str
    duration_ms: int | None


def normalize_voice_mime_type(mime_type: str) -> str:
    """Strip parameters, lowercase, and map mobile MIME aliases to canonical forms."""
    base_type = mime_type.split(";", 1)[0].strip().lower()
    return VOICE_MIME_ALIASES.get(base_type, base_type)


def _decode_base64_audio(audio_base64: str) -> bytes:
    stripped = audio_base64.strip()
    if not stripped:
        raise ApiHttpError(422, "VOICE_INVALID_AUDIO", "Audio payload must not be empty.")
    if len(stripped) > _MAX_BASE64_DECODE_CHARS:
        raise ApiHttpError(
            413,
            "VOICE_AUDIO_TOO_LARGE",
            "Audio payload exceeds the 2 MB limit.",
        )

    try:
        decoded = base64.b64decode(stripped, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ApiHttpError(422, "VOICE_INVALID_AUDIO", "Invalid base64 audio payload.") from exc

    if not decoded:
        raise ApiHttpError(422, "VOICE_INVALID_AUDIO", "Audio payload must not be empty.")
    if len(decoded) > MAX_VOICE_AUDIO_BYTES:
        raise ApiHttpError(
            413,
            "VOICE_AUDIO_TOO_LARGE",
            "Audio payload exceeds the 2 MB limit.",
        )
    return decoded


def _matches_magic_bytes(data: bytes, mime_type: str) -> bool:
    if mime_type in _ISOBMFF_MIME_TYPES:
        return len(data) >= 12 and data[4:8] == b"ftyp"
    if mime_type == "audio/aac":
        is_adts = len(data) >= 7 and data[0] == 0xFF and (data[1] & 0xF6) == 0xF0
        is_adif = data.startswith(b"ADIF")
        return is_adts or is_adif
    if mime_type == "audio/wav":
        return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WAVE"
    if mime_type == "audio/webm":
        return len(data) >= 4 and data.startswith(b"\x1a\x45\xdf\xa3")
    if mime_type == "audio/mpeg":
        is_id3 = len(data) >= 10 and data.startswith(b"ID3")
        # Layer bits != 00 distinguishes MPEG audio frames from ADTS AAC sync frames.
        is_mp3_frame = (
            len(data) >= 2 and data[0] == 0xFF and (data[1] & 0xE0) == 0xE0 and (data[1] & 0x06) != 0
        )
        return is_id3 or is_mp3_frame
    if mime_type == "audio/ogg":
        return len(data) >= 4 and data.startswith(b"OggS")
    return False


def _iter_isobmff_boxes(
    buf: bytearray, start: int, end: int
) -> list[tuple[int, int, int, bytes]]:
    """Parse ISOBMFF boxes in [start, end), returning (pos, header_size, box_end, box_type)."""
    boxes: list[tuple[int, int, int, bytes]] = []
    pos = start
    while pos < end:
        if pos + 8 > end:
            raise ApiHttpError(422, "VOICE_INVALID_AUDIO", "Corrupt M4A/MP4 container header.")
        size32 = int.from_bytes(buf[pos : pos + 4], "big")
        box_type = bytes(buf[pos + 4 : pos + 8])
        if size32 == 1:
            if pos + 16 > end:
                raise ApiHttpError(422, "VOICE_INVALID_AUDIO", "Truncated extended M4A box.")
            box_size = int.from_bytes(buf[pos + 8 : pos + 16], "big")
            header_size = 16
            if box_size < 16:
                raise ApiHttpError(422, "VOICE_INVALID_AUDIO", "Invalid extended M4A box size.")
        elif size32 == 0:
            box_size = end - pos
            header_size = 8
        elif size32 < 8:
            raise ApiHttpError(422, "VOICE_INVALID_AUDIO", "Invalid M4A box size.")
        else:
            box_size = size32
            header_size = 8

        box_end = pos + box_size
        if box_end > end:
            raise ApiHttpError(422, "VOICE_INVALID_AUDIO", "Truncated M4A/MP4 container box.")

        boxes.append((pos, header_size, box_end, box_type))
        pos = box_end
    return boxes


def _blank_box_to_free(buf: bytearray, pos: int, header_size: int, box_end: int) -> None:
    """Replace box type with 'free' and zero its payload in place to preserve chunk offsets."""
    buf[pos + 4 : pos + 8] = b"free"
    payload_start = pos + header_size
    buf[payload_start:box_end] = b"\x00" * (box_end - payload_start)


def _extract_mvhd_duration_ms(buf: bytearray, payload_start: int, box_end: int) -> int:
    payload_len = box_end - payload_start
    if payload_len < 4:
        raise ApiHttpError(422, "VOICE_INVALID_AUDIO", "Corrupt M4A mvhd header.")

    version = buf[payload_start]
    if version == 0:
        if payload_len < 20:
            raise ApiHttpError(422, "VOICE_INVALID_AUDIO", "Truncated M4A mvhd v0 box.")
        timescale = int.from_bytes(buf[payload_start + 12 : payload_start + 16], "big")
        duration = int.from_bytes(buf[payload_start + 16 : payload_start + 20], "big")
    elif version == 1:
        if payload_len < 32:
            raise ApiHttpError(422, "VOICE_INVALID_AUDIO", "Truncated M4A mvhd v1 box.")
        timescale = int.from_bytes(buf[payload_start + 20 : payload_start + 24], "big")
        duration = int.from_bytes(buf[payload_start + 24 : payload_start + 32], "big")
    else:
        raise ApiHttpError(422, "VOICE_INVALID_AUDIO", "Unsupported M4A mvhd version.")

    if timescale <= 0 or duration <= 0:
        raise ApiHttpError(422, "VOICE_INVALID_AUDIO", "Invalid M4A audio duration.")
    if duration * 1000 > MAX_VOICE_DURATION_MS * timescale:
        raise ApiHttpError(
            422,
            "VOICE_DURATION_EXCEEDED",
            "Voice recording exceeds maximum duration of 30 seconds.",
        )
    return (duration * 1000) // timescale


def _validate_and_strip_isobmff(data: bytes) -> tuple[bytes, int]:
    buf = bytearray(data)
    top_boxes = _iter_isobmff_boxes(buf, 0, len(buf))
    if not top_boxes or top_boxes[0][3] != b"ftyp":
        raise ApiHttpError(422, "VOICE_INVALID_AUDIO", "Missing ftyp box in M4A/MP4 audio.")

    has_moov = False
    mvhd_duration_ms: int | None = None

    for pos, header_size, box_end, box_type in top_boxes:
        if box_type in _STRIPPABLE_BOX_TYPES:
            _blank_box_to_free(buf, pos, header_size, box_end)
        elif box_type == b"moov":
            has_moov = True
            for cpos, cheader, cend, ctype in _iter_isobmff_boxes(buf, pos + header_size, box_end):
                if ctype in _STRIPPABLE_BOX_TYPES:
                    _blank_box_to_free(buf, cpos, cheader, cend)
                elif ctype == b"mvhd":
                    mvhd_duration_ms = _extract_mvhd_duration_ms(buf, cpos + cheader, cend)
                elif ctype == b"trak":
                    for tpos, theader, tend, ttype in _iter_isobmff_boxes(
                        buf, cpos + cheader, cend
                    ):
                        if ttype in _STRIPPABLE_BOX_TYPES:
                            _blank_box_to_free(buf, tpos, theader, tend)

    if not has_moov or mvhd_duration_ms is None:
        raise ApiHttpError(422, "VOICE_INVALID_AUDIO", "Missing moov/mvhd duration metadata.")

    return bytes(buf), mvhd_duration_ms


def validate_and_strip_voice_audio(
    audio_base64: str,
    mime_type: str,
    duration_ms: int | None = None,
) -> ValidatedVoiceAudio:
    """Validate audio bounds/MIME/magic bytes and strip M4A/MP4 metadata in memory."""
    decoded = _decode_base64_audio(audio_base64)

    normalized_mime = normalize_voice_mime_type(mime_type)
    if normalized_mime not in ALLOWED_VOICE_MIME_TYPES:
        raise ApiHttpError(
            422,
            "VOICE_UNSUPPORTED_MEDIA_TYPE",
            "Unsupported audio media type.",
        )

    if duration_ms is not None:
        if duration_ms <= 0:
            raise ApiHttpError(422, "VOICE_INVALID_AUDIO", "Audio duration must be positive.")
        if duration_ms > MAX_VOICE_DURATION_MS:
            raise ApiHttpError(
                422,
                "VOICE_DURATION_EXCEEDED",
                "Voice recording exceeds maximum duration of 30 seconds.",
            )

    if not _matches_magic_bytes(decoded, normalized_mime):
        raise ApiHttpError(
            422,
            "VOICE_INVALID_AUDIO",
            "Audio payload does not match declared MIME type.",
        )

    resolved_duration_ms = duration_ms
    sanitized_bytes = decoded
    if normalized_mime in _ISOBMFF_MIME_TYPES:
        sanitized_bytes, container_duration_ms = _validate_and_strip_isobmff(decoded)
        if resolved_duration_ms is None:
            resolved_duration_ms = container_duration_ms

    return ValidatedVoiceAudio(
        audio_bytes=sanitized_bytes,
        mime_type=normalized_mime,
        duration_ms=resolved_duration_ms,
    )
