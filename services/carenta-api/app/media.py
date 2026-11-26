"""Validation and sanitization for captured receipt images and voice clips (#52).

Uploads are never trusted by their file name or declared Content-Type. The
actual format is detected from the bytes, structure is checked, size and
dimension/duration bounds are enforced (plan §11: one JPEG/PNG receipt up to
5 MB, voice up to 30 seconds), and privacy-sensitive metadata is removed before
anything is stored:

- JPEG: drops EXIF/XMP (APP1), other application segments except JFIF (APP0),
  ICC colour profile (APP2) and Adobe (APP14), comments, and trailing bytes.
- PNG: drops text, EXIF and timestamp chunks and trailing bytes; CRCs are checked.
- M4A (MP4/AAC, what ``expo-audio`` records on Android and iOS): user-data and
  metadata boxes are overwritten in place with ``free`` boxes, so sample offsets
  stay valid while tags such as recording location are removed.

Only the standard library is used, so nothing here decodes pixels or audio.
"""

from __future__ import annotations

import hashlib
import struct
import zlib
from dataclasses import dataclass
from typing import Literal

MediaKind = Literal["receipt", "voice"]

RECEIPT_MAX_BYTES = 5 * 1024 * 1024
VOICE_MAX_BYTES = 2 * 1024 * 1024
RECEIPT_MIN_SIDE = 32
RECEIPT_MAX_SIDE = 10_000
RECEIPT_MAX_PIXELS = 40_000_000
VOICE_MAX_MS = 30_000
# Recorders stop slightly after the 30 s cap; allow a small container overshoot.
VOICE_DURATION_TOLERANCE_MS = 500

MEDIA_TYPES: dict[str, tuple[MediaKind, str]] = {
    "image/jpeg": ("receipt", "jpg"),
    "image/png": ("receipt", "png"),
    "audio/mp4": ("voice", "m4a"),
}

_DECLARED_ALIASES: dict[str, str] = {
    "image/jpeg": "image/jpeg",
    "image/jpg": "image/jpeg",
    "image/pjpeg": "image/jpeg",
    "image/png": "image/png",
    "audio/mp4": "audio/mp4",
    "audio/m4a": "audio/mp4",
    "audio/x-m4a": "audio/mp4",
    "audio/aac": "audio/mp4",
}

_MP4_AUDIO_BRANDS = frozenset({b"M4A ", b"mp42", b"mp41", b"isom", b"iso2", b"3gp4", b"3gp5", b"MSNV"})
_MP4_METADATA_BOXES = frozenset({b"udta", b"meta"})


class MediaValidationError(ValueError):
    """Rejected upload. ``code`` is stable for API error envelopes; the message is safe to show."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class SanitizedMedia:
    kind: MediaKind
    mime_type: str
    extension: str
    data: bytes
    sha256: str
    width: int | None = None
    height: int | None = None
    duration_ms: int | None = None

    @property
    def size_bytes(self) -> int:
        return len(self.data)


def sanitize_media(kind: MediaKind, data: bytes, declared_mime: str | None = None) -> SanitizedMedia:
    """Validate ``data`` as a ``kind`` upload and return a metadata-free copy."""
    if kind not in ("receipt", "voice"):
        raise MediaValidationError("MEDIA_UNSUPPORTED_TYPE", "Unsupported media kind.")
    if not isinstance(data, (bytes, bytearray)) or len(data) == 0:
        raise MediaValidationError("MEDIA_EMPTY", "The uploaded file is empty.")
    limit = RECEIPT_MAX_BYTES if kind == "receipt" else VOICE_MAX_BYTES
    if len(data) > limit:
        raise MediaValidationError(
            "MEDIA_TOO_LARGE", f"The file is larger than {limit // (1024 * 1024)} MB."
        )

    data = bytes(data)
    detected = _detect_mime(data)
    if detected is None or MEDIA_TYPES[detected][0] != kind:
        expected = "JPEG or PNG image" if kind == "receipt" else "M4A audio recording"
        raise MediaValidationError("MEDIA_UNSUPPORTED_TYPE", f"Expected a {expected}.")
    if declared_mime is not None:
        declared = _DECLARED_ALIASES.get(declared_mime.split(";")[0].strip().lower())
        if declared != detected:
            raise MediaValidationError(
                "MEDIA_TYPE_MISMATCH", "The declared file type does not match its contents."
            )

    if detected == "image/jpeg":
        clean, width, height = _sanitize_jpeg(data)
        _check_dimensions(width, height)
        return _result(kind, detected, clean, width=width, height=height)
    if detected == "image/png":
        clean, width, height = _sanitize_png(data)
        _check_dimensions(width, height)
        return _result(kind, detected, clean, width=width, height=height)
    clean, duration_ms = _sanitize_m4a(data)
    if duration_ms > VOICE_MAX_MS + VOICE_DURATION_TOLERANCE_MS:
        raise MediaValidationError("MEDIA_TOO_LONG", "Voice recordings are limited to 30 seconds.")
    return _result(kind, detected, clean, duration_ms=duration_ms)


def _result(kind: MediaKind, mime: str, data: bytes, **extra: int) -> SanitizedMedia:
    return SanitizedMedia(
        kind=kind,
        mime_type=mime,
        extension=MEDIA_TYPES[mime][1],
        data=data,
        sha256=hashlib.sha256(data).hexdigest(),
        **extra,
    )


def _detect_mime(data: bytes) -> str | None:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if len(data) >= 12 and data[4:8] == b"ftyp":
        return "audio/mp4"
    return None


def _corrupt(what: str) -> MediaValidationError:
    return MediaValidationError("MEDIA_CORRUPT", f"The {what} file is damaged or incomplete.")


def _check_dimensions(width: int, height: int) -> None:
    if (
        min(width, height) < RECEIPT_MIN_SIDE
        or max(width, height) > RECEIPT_MAX_SIDE
        or width * height > RECEIPT_MAX_PIXELS
    ):
        raise MediaValidationError(
            "MEDIA_DIMENSIONS", "The receipt image is too small or too large to process."
        )


# --- JPEG -----------------------------------------------------------------

_JPEG_SOF = frozenset({0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF})
# Kept: APP0 (JFIF), APP2 (ICC colour profile), APP14 (Adobe colour transform).
_JPEG_KEEP_APP = frozenset({0xE0, 0xE2, 0xEE})


def _sanitize_jpeg(data: bytes) -> tuple[bytes, int, int]:
    out = bytearray(b"\xff\xd8")
    pos = 2
    width = height = None
    while True:
        if pos + 4 > len(data) or data[pos] != 0xFF:
            raise _corrupt("image")
        marker = data[pos + 1]
        if marker == 0xFF:  # fill byte
            pos += 1
            continue
        if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
            raise _corrupt("image")
        (length,) = struct.unpack(">H", data[pos + 2 : pos + 4])
        end = pos + 2 + length
        if length < 2 or end > len(data):
            raise _corrupt("image")
        segment = data[pos:end]
        if marker in _JPEG_SOF:
            if length < 8:
                raise _corrupt("image")
            height, width = struct.unpack(">HH", data[pos + 5 : pos + 9])
        if marker == 0xDA:  # start of scan: copy compressed data through the last EOI
            eoi = data.rfind(b"\xff\xd9")
            if width is None or eoi < end:
                raise _corrupt("image")
            out += data[pos : eoi + 2]
            return bytes(out), width, height
        is_app = 0xE0 <= marker <= 0xEF
        if not ((is_app and marker not in _JPEG_KEEP_APP) or marker == 0xFE):
            out += segment
        pos = end


# --- PNG ------------------------------------------------------------------

_PNG_DROP_CHUNKS = frozenset({b"tEXt", b"zTXt", b"iTXt", b"eXIf", b"tIME"})


def _sanitize_png(data: bytes) -> tuple[bytes, int, int]:
    out = bytearray(data[:8])
    pos = 8
    width = height = None
    first = True
    while True:
        if pos + 12 > len(data):
            raise _corrupt("image")
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        ctype = data[pos + 4 : pos + 8]
        end = pos + 12 + length
        if end > len(data):
            raise _corrupt("image")
        body = data[pos + 8 : pos + 8 + length]
        (crc,) = struct.unpack(">I", data[pos + 8 + length : end])
        if zlib.crc32(ctype + body) != crc:
            raise _corrupt("image")
        if first:
            if ctype != b"IHDR" or length != 13:
                raise _corrupt("image")
            width, height = struct.unpack(">II", body[:8])
            first = False
        if ctype not in _PNG_DROP_CHUNKS:
            out += data[pos:end]
        if ctype == b"IEND":
            return bytes(out), width, height
        pos = end


# --- M4A (ISO base media file) ---------------------------------------------


def _iter_boxes(data: bytes | bytearray, start: int, stop: int):
    pos = start
    while pos < stop:
        if pos + 8 > stop:
            raise _corrupt("audio")
        size, btype = struct.unpack(">I4s", data[pos : pos + 8])
        header = 8
        if size == 1:
            if pos + 16 > stop:
                raise _corrupt("audio")
            (size,) = struct.unpack(">Q", data[pos + 8 : pos + 16])
            header = 16
        elif size == 0:
            size = stop - pos
        if size < header or pos + size > stop:
            raise _corrupt("audio")
        yield pos, header, size, btype
        pos += size


def _blank_box(buf: bytearray, pos: int, header: int, size: int) -> None:
    buf[pos + header - 4 : pos + header] = b"free"
    buf[pos + header : pos + size] = bytes(size - header)


def _sanitize_m4a(data: bytes) -> tuple[bytes, int]:
    buf = bytearray(data)
    boxes = list(_iter_boxes(buf, 0, len(buf)))
    if not boxes or boxes[0][3] != b"ftyp":
        raise _corrupt("audio")
    fpos, fheader, fsize, _ = boxes[0]
    brands = {bytes(buf[fpos + fheader : fpos + fheader + 4])}
    brands.update(
        bytes(buf[i : i + 4]) for i in range(fpos + fheader + 8, fpos + fsize - 3, 4)
    )
    if not brands & _MP4_AUDIO_BRANDS:
        raise MediaValidationError("MEDIA_UNSUPPORTED_TYPE", "Expected a M4A audio recording.")

    duration_ms = None
    has_mdat = False
    for pos, header, size, btype in boxes[1:]:
        if btype == b"mdat":
            has_mdat = True
        elif btype in _MP4_METADATA_BOXES:
            _blank_box(buf, pos, header, size)
        elif btype == b"moov":
            for cpos, cheader, csize, ctype in _iter_boxes(buf, pos + header, pos + size):
                if ctype == b"mvhd":
                    duration_ms = _mvhd_duration_ms(buf, cpos + cheader, cpos + csize)
                elif ctype in _MP4_METADATA_BOXES:
                    _blank_box(buf, cpos, cheader, csize)
    if duration_ms is None or not has_mdat:
        raise _corrupt("audio")
    return bytes(buf), duration_ms


def _mvhd_duration_ms(buf: bytearray, start: int, stop: int) -> int:
    if start + 4 > stop:
        raise _corrupt("audio")
    version = buf[start]
    if version == 1:
        if start + 32 > stop:
            raise _corrupt("audio")
        timescale, duration = struct.unpack(">IQ", buf[start + 20 : start + 32])
    else:
        if start + 20 > stop:
            raise _corrupt("audio")
        timescale, duration = struct.unpack(">II", buf[start + 12 : start + 20])
    if timescale == 0:
        raise _corrupt("audio")
    return duration * 1000 // timescale
