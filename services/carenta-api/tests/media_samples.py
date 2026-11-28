"""Synthetic media builders for #52 tests. No real receipts or recordings."""

from __future__ import annotations

import struct
import zlib

GPS_MARKER = b"GPS-10.7626N-106.6602E"


def jpeg(width: int = 640, height: int = 480, *, exif: bool = True, comment: bool = True, trailer: bytes = b"") -> bytes:
    def seg(marker: int, payload: bytes) -> bytes:
        return bytes([0xFF, marker]) + struct.pack(">H", len(payload) + 2) + payload

    parts = [b"\xff\xd8", seg(0xE0, b"JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00")]
    if exif:
        parts.append(seg(0xE1, b"Exif\x00\x00" + GPS_MARKER))
        parts.append(seg(0xE1, b"http://ns.adobe.com/xap/1.0/\x00<x:xmpmeta>" + GPS_MARKER))
    parts.append(seg(0xE2, b"ICC_PROFILE\x00\x01\x01fake-icc"))
    if comment:
        parts.append(seg(0xFE, b"taken at " + GPS_MARKER))
    parts.append(seg(0xDB, b"\x00" + bytes(range(64))))
    parts.append(seg(0xC0, b"\x08" + struct.pack(">HH", height, width) + b"\x01\x01\x11\x00"))
    parts.append(seg(0xDA, b"\x01\x01\x00\x00\x3f\x00"))
    parts.append(b"\x12\x34\xff\x00\x56\xff\xd0\x78")  # entropy data with stuffing + restart marker
    parts.append(b"\xff\xd9")
    return b"".join(parts) + trailer


def png(width: int = 640, height: int = 480, *, text: bool = True, trailer: bytes = b"", bad_crc: bool = False) -> bytes:
    def chunk(ctype: bytes, body: bytes) -> bytes:
        crc = zlib.crc32(ctype + body) ^ (1 if bad_crc and ctype == b"IDAT" else 0)
        return struct.pack(">I", len(body)) + ctype + body + struct.pack(">I", crc)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 0, 0, 0, 0)
    idat = zlib.compress(b"\x00" + b"\xff" * min(width, 64))
    parts = [b"\x89PNG\r\n\x1a\n", chunk(b"IHDR", ihdr)]
    if text:
        parts.append(chunk(b"tEXt", b"Location\x00" + GPS_MARKER))
        parts.append(chunk(b"eXIf", b"MM\x00*" + GPS_MARKER))
        parts.append(chunk(b"tIME", b"\x07\xea\x0b\x1a\x0c\x00\x00"))
    parts += [chunk(b"IDAT", idat), chunk(b"IEND", b"")]
    return b"".join(parts) + trailer


def m4a(
    duration_ms: int = 12_000,
    *,
    brand: bytes = b"M4A ",
    compatible: bytes = b"isom",
    metadata: bool = True,
    mvhd_version: int = 0,
    handler: bytes = b"soun",
    trak_metadata: bool = False,
    udta_64bit: bool = False,
) -> bytes:
    def box(btype: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body) + 8) + btype + body

    timescale = 44_100
    duration = duration_ms * timescale // 1000
    if mvhd_version == 1:
        mvhd = b"\x01\x00\x00\x00" + struct.pack(">QQIQ", 0, 0, timescale, duration) + bytes(80)
    else:
        mvhd = b"\x00\x00\x00\x00" + struct.pack(">IIII", 0, 0, timescale, duration) + bytes(80)
    hdlr = box(b"hdlr", bytes(4) + bytes(4) + handler + bytes(12) + b"SoundHandler\x00")
    trak_children = [box(b"tkhd", bytes(84)), box(b"mdia", hdlr)]
    if trak_metadata:
        trak_children.append(box(b"udta", box(b"\xa9xyz", GPS_MARKER)))
    moov_children = [box(b"mvhd", mvhd), box(b"trak", b"".join(trak_children))]
    if metadata:
        udta_body = box(b"\xa9xyz", GPS_MARKER)
        if udta_64bit:  # size field 1 + 64-bit largesize
            moov_children.append(struct.pack(">I4sQ", 1, b"udta", len(udta_body) + 16) + udta_body)
        else:
            moov_children.append(box(b"udta", udta_body))
    ftyp = box(b"ftyp", brand + b"\x00\x00\x02\x00" + brand + compatible)
    moov = box(b"moov", b"".join(moov_children))
    mdat = box(b"mdat", b"\x21\x10\x05\x45" * 64)
    return ftyp + moov + mdat
