"""Shared synthetic container builders for Voice Capture API tests."""

from __future__ import annotations

import struct


def make_box(box_type: bytes, payload: bytes) -> bytes:
    """Build a 32-bit length-prefixed ISOBMFF box."""
    return struct.pack(">I", 8 + len(payload)) + box_type + payload


def make_m4a_bytes(
    *,
    timescale: int = 1000,
    duration: int = 4000,
    brand: bytes = b"M4A ",
    mvhd_version: int = 0,
    moov_extra_boxes: bytes = b"",
    top_extra_boxes: bytes = b"",
    mdat_payload: bytes = b"\x11\x22\x33\x44",
) -> bytes:
    """Build minimal valid M4A/MP4 container bytes for testing."""
    ftyp = make_box(b"ftyp", brand + b"\x00\x00\x00\x00" + brand)
    if mvhd_version == 0:
        mvhd_payload = struct.pack(">IIIIII", 0, 0, 0, timescale, duration, 0x00010000) + b"\x00" * 76
    else:
        mvhd_payload = (
            struct.pack(">B3sQQIQ", 1, b"\x00\x00\x00", 0, 0, timescale, duration)
            + b"\x00" * 80
        )
    moov = make_box(b"moov", make_box(b"mvhd", mvhd_payload) + moov_extra_boxes)
    mdat = make_box(b"mdat", mdat_payload)
    return ftyp + top_extra_boxes + moov + mdat


def make_wav_bytes(
    *,
    duration_ms: int = 2000,
    sample_rate: int = 8000,
    channels: int = 1,
    bits_per_sample: int = 8,
    extra_chunks: bytes = b"",
) -> bytes:
    """Build minimal valid PCM RIFF/WAVE bytes with fmt and data chunks."""
    block_align = channels * (bits_per_sample // 8)
    byte_rate = sample_rate * block_align
    data_size = (byte_rate * duration_ms) // 1000
    fmt_payload = struct.pack(
        "<HHIIHH",
        1,  # PCM
        channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
    )
    fmt_chunk = b"fmt " + struct.pack("<I", len(fmt_payload)) + fmt_payload
    data_chunk = b"data" + struct.pack("<I", data_size) + (b"\x00" * data_size)
    riff_body = b"WAVE" + extra_chunks + fmt_chunk + data_chunk
    return b"RIFF" + struct.pack("<I", len(riff_body)) + riff_body
