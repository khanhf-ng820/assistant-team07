"""Voice Capture schemas, parser seam, quota tracker, and Vietnamese draft normalization."""

from __future__ import annotations

import datetime as dt
import inspect
import math
import re
import threading
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any, Literal, Protocol
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StrictInt

from app.errors import ApiHttpError
from app.voice_audio import validate_and_strip_voice_audio

try:
    VIETNAM_TZ: dt.tzinfo = ZoneInfo("Asia/Ho_Chi_Minh")
except ZoneInfoNotFoundError:  # pragma: no cover - fallback when tzdata is absent
    VIETNAM_TZ = dt.timezone(dt.timedelta(hours=7), name="Asia/Ho_Chi_Minh")

MIN_VND_AMOUNT = 1
MAX_VND_AMOUNT = 1_000_000_000_000

VoiceCaptureCategory = Literal[
    "food",
    "transport",
    "shopping",
    "bills",
    "education",
    "entertainment",
    "other",
]

_VALID_CATEGORIES: frozenset[str] = frozenset(
    {"food", "transport", "shopping", "bills", "education", "entertainment", "other"}
)

_CATEGORY_ALIASES: dict[str, VoiceCaptureCategory] = {
    "food": "food",
    "ăn uống": "food",
    "an uong": "food",
    "đồ ăn": "food",
    "transport": "transport",
    "di chuyển": "transport",
    "di chuyen": "transport",
    "đi lại": "transport",
    "shopping": "shopping",
    "mua sắm": "shopping",
    "mua sam": "shopping",
    "bills": "bills",
    "hóa đơn": "bills",
    "hoa don": "bills",
    "education": "education",
    "giáo dục": "education",
    "giao duc": "education",
    "học tập": "education",
    "hoc tap": "education",
    "entertainment": "entertainment",
    "giải trí": "entertainment",
    "giai tri": "entertainment",
    "other": "other",
    "khác": "other",
    "khac": "other",
}

_UNIT_MULTIPLIERS: dict[str, int] = {
    "k": 1_000,
    "nghìn": 1_000,
    "ngàn": 1_000,
    "tr": 1_000_000,
    "triệu": 1_000_000,
    "củ": 1_000_000,
    "tỷ": 1_000_000_000,
    "tỉ": 1_000_000_000,
}

_VN_DIGITS: dict[str, int] = {
    "không": 0,
    "linh": 0,
    "lẻ": 0,
    "một": 1,
    "mốt": 1,
    "hai": 2,
    "ba": 3,
    "bốn": 4,
    "tư": 4,
    "năm": 5,
    "lăm": 5,
    "nhăm": 5,
    "sáu": 6,
    "bảy": 7,
    "bẩy": 7,
    "tám": 8,
    "chín": 9,
}

_CURRENCY_SUFFIX_RE = re.compile(r"\s*(?:vnđ|vnd|đồng|đ)\s*$", re.IGNORECASE)
_NUMERIC_UNIT_RE = re.compile(
    r"^(\d+(?:[.,]\d+)?)\s*(k|nghìn|ngàn|tr|triệu|củ|tỷ|tỉ)(?:\s*(rưỡi|\d{1,3}))?$",
    re.IGNORECASE,
)
_THOUSAND_GROUPED_RE = re.compile(r"^\d{1,3}(?:[.\s,]\d{3})+$")
_PLAIN_DIGITS_RE = re.compile(r"^\d+$")

_TEXT_AMOUNT_SPAN_RE = re.compile(
    r"(?:"
    r"\d+(?:[.,]\d+)?\s*(?:k|nghìn|ngàn|tr|triệu|củ|tỷ|tỉ)(?:\s*(?:rưỡi|\d{1,3}(?:\s*(?:nghìn|ngàn|trăm))?))?"
    r"|"
    r"(?:nửa|một|mốt|hai|ba|bốn|tư|năm|lăm|nhăm|sáu|bảy|bẩy|tám|chín|mười|mươi|chục|trăm|linh|lẻ)"
    r"(?:\s+(?:không|linh|lẻ|một|mốt|hai|ba|bốn|tư|năm|lăm|nhăm|sáu|bảy|bẩy|tám|chín|mười|mươi|chục|trăm|rưỡi|nửa|nghìn|ngàn|triệu|củ|tỷ|tỉ|\d{1,3}))*"
    r"\s+(?:nghìn|ngàn|triệu|củ|tỷ|tỉ)"
    r"(?:\s+(?:rưỡi|hai|ba|bốn|tư|năm|lăm|sáu|bảy|tám|chín|\d{1,3})(?:\s+(?:trăm|nghìn|ngàn))?)?"
    r"|"
    r"\d{1,3}(?:[.\s,]\d{3})+\s*(?:vnđ|vnd|đồng|đ)"
    r"|"
    r"\d+\s*(?:vnđ|vnd|đồng|đ)"
    r")(?:\s*(?:vnđ|vnd|đồng|đ))?",
    re.IGNORECASE,
)

_NEGATION_RE = re.compile(
    r"(?<!\w)(?:"
    r"(?:không|ko|k|hông|chưa|khỏi|đừng|thôi\s+không|thôi\s+ko)\s+"
    r"(?:mua|trả|chi|tiêu|tính|ghi|đặt|order|lấy|uống|ăn|đi|tốn)"
    r"|"
    r"(?:hủy|huỷ|bỏ\s+qua|nhầm\s+rồi|không\s+phải\s+chi|không\s+tốn)"
    r")(?!\w)",
    re.IGNORECASE,
)

_SILENCE_MARKERS = frozenset({"[silence]", "(silence)", "silence", "[im lặng]", "(im lặng)"})
_RELATIVE_DAY_OFFSETS: tuple[tuple[tuple[str, ...], int], ...] = (
    (("hôm kia", "bữa kia"), -2),
    (("hôm qua", "tối qua", "chiều qua", "trưa qua", "sáng qua", "bữa qua"), -1),
    (
        (
            "hôm nay",
            "bữa nay",
            "sáng nay",
            "trưa nay",
            "chiều nay",
            "tối nay",
            "hồi nãy",
            "vừa nãy",
            "lúc nãy",
        ),
        0,
    ),
)
_CLOCK_TIME_RE = re.compile(
    r"(?<!\d)(\d{1,2})\s*(?:h|:|giờ)\s*(\d{1,2})?(?:\s*(sáng|trưa|chiều|tối|đêm))?(?!\w)",
    re.IGNORECASE,
)


class VoiceCaptureRequest(BaseModel):
    """JSON base64 Voice Capture request contract."""

    model_config = ConfigDict(extra="forbid")

    audio_base64: str
    mime_type: str
    duration_ms: int | None = None


class VoiceCaptureDraft(BaseModel):
    """Normalized, unsaved Capture Draft returned from Voice Capture."""

    model_config = ConfigDict(extra="forbid")

    amount: StrictInt | None = None
    currency: Literal["VND"] | None = None
    category: VoiceCaptureCategory | None = None
    merchant: str | None = None
    description: str | None = None
    recognized_text: str | None = None
    occurred_on: dt.date | None = None
    timestamp: AwareDatetime | None = None
    uncertain_fields: list[str] = Field(default_factory=list)
    has_low_confidence: bool = False


class VoiceParserProtocol(Protocol):
    """Stubbable speech-to-draft parser boundary."""

    async def parse(
        self,
        audio_bytes: bytes,
        mime_type: str,
        *,
        duration_ms: int | None = None,
    ) -> VoiceCaptureDraft | Mapping[str, Any]: ...


class VoiceStorageHook(Protocol):
    """Optional audio retention hook (disabled by default)."""

    async def store(
        self,
        *,
        user_id: str,
        audio_bytes: bytes,
        mime_type: str,
    ) -> str | None: ...


class UnavailableVoiceParser:
    """Default fail-closed parser when no Gemini/voice parser backend is configured."""

    async def parse(
        self,
        audio_bytes: bytes,
        mime_type: str,
        *,
        duration_ms: int | None = None,
    ) -> VoiceCaptureDraft | Mapping[str, Any]:
        raise ApiHttpError(
            503,
            "VOICE_PARSER_UNAVAILABLE",
            "Voice parsing service is not configured.",
        )


def to_vietnam_local_time(value: dt.datetime | None = None) -> dt.datetime:
    """Convert a naive or aware datetime (defaulting to now) into Asia/Ho_Chi_Minh."""
    if value is None:
        return dt.datetime.now(VIETNAM_TZ)
    if value.tzinfo is None:
        return value.replace(tzinfo=VIETNAM_TZ)
    return value.astimezone(VIETNAM_TZ)


def _in_vnd_bounds(value: int) -> int | None:
    return value if MIN_VND_AMOUNT <= value <= MAX_VND_AMOUNT else None


@dataclass
class _VnWordPhraseAccumulator:
    total: int = 0
    current_group: int = 0
    pending: int = 0
    last_scale: int | None = None
    pending_half: bool = False
    saw_explicit_sub_unit: bool = False
    consumed_any: bool = False

    def apply_sub_unit(self, tok: str) -> bool:
        if tok == "mười":
            self.current_group += self.pending + 10
            self.pending = 0
        elif tok in {"chục", "mươi"}:
            if self.pending == 0 and tok == "chục":
                self.current_group += 10
            elif self.pending > 0:
                self.current_group += self.pending * 10
                self.pending = 0
            else:
                return False
        elif tok == "trăm":
            self.current_group += (self.pending or 1) * 100
            self.pending = 0
        self.saw_explicit_sub_unit = True
        self.consumed_any = True
        return True

    def apply_ruoi(self) -> bool:
        if self.current_group > 0 or self.pending > 0:
            if self.last_scale is not None and not self.saw_explicit_sub_unit:
                return False
            if self.pending > 0:
                self.current_group += self.pending
                self.pending = 0
            self.current_group += 50 if self.current_group >= 100 else 5
        elif self.last_scale is not None:
            self.total += self.last_scale // 2
        else:
            return False
        self.consumed_any = True
        return True

    def apply_unit(self, scale: int) -> bool:
        group_val = self.current_group + self.pending
        if self.pending_half and group_val == 0:
            self.total += scale // 2
            self.pending_half = False
        elif group_val > 0:
            self.total += group_val * scale
            self.current_group = 0
            self.pending = 0
        else:
            return False
        self.last_scale = scale
        self.saw_explicit_sub_unit = False
        self.consumed_any = True
        return True

    def finalize(self) -> int | None:
        if not self.consumed_any or self.pending_half:
            return None
        rem = self.current_group + self.pending
        if rem > 0:
            self.total += _scale_trailing_remainder(
                rem, self.last_scale, self.saw_explicit_sub_unit
            )
        return _in_vnd_bounds(self.total)


def _scale_trailing_remainder(
    rem: int, last_scale: int | None, saw_explicit_sub_unit: bool
) -> int:
    if last_scale is None or saw_explicit_sub_unit or rem >= 1000:
        return rem
    if rem < 10:
        return rem * (last_scale // 10)
    if rem < 100 and last_scale >= 10_000:
        return rem * (last_scale // 100)
    if last_scale >= 1_000_000:
        return rem * (last_scale // 1_000)
    return rem


def _parse_vn_word_phrase(cleaned: str) -> int | None:
    tokens = cleaned.split()
    if not tokens:
        return None

    acc = _VnWordPhraseAccumulator()
    for tok in tokens:
        if tok == "nửa":
            acc.pending_half = True
            acc.consumed_any = True
        elif tok in {"mười", "chục", "mươi", "trăm"}:
            if not acc.apply_sub_unit(tok):
                return None
        elif tok == "rưỡi":
            if not acc.apply_ruoi():
                return None
        elif tok in _VN_DIGITS or tok.isdigit():
            acc.current_group += acc.pending
            acc.pending = _VN_DIGITS[tok] if tok in _VN_DIGITS else int(tok)
            acc.consumed_any = True
        elif tok in _UNIT_MULTIPLIERS:
            if not acc.apply_unit(_UNIT_MULTIPLIERS[tok]):
                return None
        else:
            return None

    return acc.finalize()


def parse_vietnamese_amount(value: object) -> int | None:
    """Parse integer VND or Vietnamese spoken/shorthand amount into positive integer VND."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int):
        return _in_vnd_bounds(value)
    if isinstance(value, float):
        if math.isfinite(value) and value.is_integer():
            return _in_vnd_bounds(int(value))
        return None
    if not isinstance(value, str):
        return None

    cleaned = _CURRENCY_SUFFIX_RE.sub("", value.strip().lower()).strip()
    if not cleaned:
        return None

    if _PLAIN_DIGITS_RE.match(cleaned):
        return _in_vnd_bounds(int(cleaned))

    if _THOUSAND_GROUPED_RE.match(cleaned):
        digits_only = re.sub(r"[.\s,]", "", cleaned)
        return _in_vnd_bounds(int(digits_only))

    unit_match = _NUMERIC_UNIT_RE.match(cleaned)
    if unit_match:
        num_str, unit_key, sub_str = unit_match.groups()
        unit = _UNIT_MULTIPLIERS[unit_key.lower()]
        try:
            base_decimal = Decimal(num_str.replace(",", "."))
        except InvalidOperation:
            return None
        amount_dec = base_decimal * unit
        if amount_dec != int(amount_dec):
            return None
        amount = int(amount_dec)
        if sub_str:
            if sub_str.lower() == "rưỡi":
                amount += unit // 2
            elif "." not in num_str and "," not in num_str:
                divisor = 10 ** len(sub_str)
                if divisor > unit:
                    return None
                amount += int(sub_str) * (unit // divisor)
            else:
                return None
        return _in_vnd_bounds(amount)

    return _parse_vn_word_phrase(cleaned)


def _clean_optional_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


def _is_silence_text(text: str | None) -> bool:
    if text is None:
        return True
    lowered = text.strip().lower()
    if not lowered or lowered in _SILENCE_MARKERS:
        return True
    return not any(ch.isalnum() for ch in lowered)


def _find_amount_mentions(text: str) -> list[str]:
    return [m.group(0).strip() for m in _TEXT_AMOUNT_SPAN_RE.finditer(text)]


def _resolve_relative_date(text: str, local_today: dt.date) -> dt.date | None:
    lowered = text.lower()
    for phrases, offset in _RELATIVE_DAY_OFFSETS:
        for phrase in phrases:
            if re.search(rf"(?<!\w){re.escape(phrase)}(?!\w)", lowered):
                return local_today + dt.timedelta(days=offset)
    return None


def _resolve_occurred_on(
    raw_occurred_on: object,
    recognized_text: str | None,
    local_today: dt.date,
    is_silence: bool,
) -> dt.date | None:
    if isinstance(raw_occurred_on, dt.datetime):
        return raw_occurred_on.astimezone(VIETNAM_TZ).date()
    if isinstance(raw_occurred_on, dt.date):
        return raw_occurred_on
    if isinstance(raw_occurred_on, str):
        cleaned = raw_occurred_on.strip()
        if cleaned:
            rel = _resolve_relative_date(cleaned, local_today)
            if rel is not None:
                return rel
            try:
                return dt.date.fromisoformat(cleaned)
            except ValueError:
                pass

    if recognized_text:
        rel = _resolve_relative_date(recognized_text, local_today)
        if rel is not None:
            return rel
    if is_silence:
        return None
    return local_today


def _resolve_timestamp(
    raw_timestamp: object,
    recognized_text: str | None,
    occurred_on: dt.date | None,
) -> dt.datetime | None:
    if isinstance(raw_timestamp, dt.datetime):
        return to_vietnam_local_time(raw_timestamp)
    if isinstance(raw_timestamp, str):
        cleaned = raw_timestamp.strip()
        if cleaned:
            try:
                parsed = dt.datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
                return to_vietnam_local_time(parsed)
            except ValueError:
                pass

    if recognized_text and occurred_on is not None:
        match = _CLOCK_TIME_RE.search(recognized_text)
        if match:
            hour = int(match.group(1))
            minute = int(match.group(2)) if match.group(2) else 0
            period = (match.group(3) or "").lower()
            if period in {"chiều", "tối", "đêm"} and 1 <= hour <= 11:
                hour += 12
            elif period == "trưa" and 1 <= hour <= 10:
                hour += 12
            elif period == "sáng" and hour == 12:
                hour = 0
            if 0 <= hour <= 23 and 0 <= minute <= 59:
                return dt.datetime(
                    occurred_on.year,
                    occurred_on.month,
                    occurred_on.day,
                    hour,
                    minute,
                    tzinfo=VIETNAM_TZ,
                )
    return None


def _normalize_category(raw_category: object) -> tuple[VoiceCaptureCategory | None, bool]:
    if raw_category is None:
        return None, False
    if not isinstance(raw_category, str):
        return None, True
    cleaned = raw_category.strip().lower()
    if not cleaned:
        return None, False
    mapped = _CATEGORY_ALIASES.get(cleaned)
    if mapped is not None:
        return mapped, False
    if cleaned in _VALID_CATEGORIES:
        return cleaned, False  # type: ignore[return-value]
    return None, True


def normalize_voice_draft(
    raw: VoiceCaptureDraft | Mapping[str, Any],
    *,
    now: dt.datetime | None = None,
) -> VoiceCaptureDraft:
    """Deterministically normalize and bound a parser response into a VoiceCaptureDraft."""
    data = raw.model_dump() if isinstance(raw, VoiceCaptureDraft) else dict(raw)
    local_now = to_vietnam_local_time(now)
    local_today = local_now.date()

    recognized_text = _clean_optional_text(data.get("recognized_text"))
    is_silence = bool(data.get("is_silence")) or _is_silence_text(recognized_text)
    is_negated = bool(data.get("is_negated")) or (
        recognized_text is not None and bool(_NEGATION_RE.search(recognized_text))
    )
    text_mentions = _find_amount_mentions(recognized_text) if recognized_text else []
    multiple_purchases = bool(data.get("multiple_purchases")) or len(text_mentions) >= 2

    uncertain_fields: list[str] = []
    for item in data.get("uncertain_fields") or []:
        if isinstance(item, str) and item.strip() and item.strip() not in uncertain_fields:
            uncertain_fields.append(item.strip())

    def _mark_uncertain(field_name: str) -> None:
        if field_name not in uncertain_fields:
            uncertain_fields.append(field_name)

    parsed_amount: int | None = None
    if not (is_silence or is_negated or multiple_purchases):
        parsed_amount = parse_vietnamese_amount(data.get("amount"))
        if parsed_amount is None and data.get("amount") is None and len(text_mentions) == 1:
            parsed_amount = parse_vietnamese_amount(text_mentions[0])

    if parsed_amount is None:
        _mark_uncertain("amount")

    currency: Literal["VND"] | None = "VND" if parsed_amount is not None else None
    category, invalid_category = _normalize_category(data.get("category"))
    if invalid_category:
        _mark_uncertain("category")

    occurred_on = _resolve_occurred_on(
        data.get("occurred_on"), recognized_text, local_today, is_silence
    )
    timestamp = _resolve_timestamp(data.get("timestamp"), recognized_text, occurred_on)
    if occurred_on is None and timestamp is not None:
        occurred_on = timestamp.date()

    has_low_confidence = bool(
        data.get("has_low_confidence")
        or uncertain_fields
        or parsed_amount is None
        or is_silence
        or is_negated
        or multiple_purchases
    )

    return VoiceCaptureDraft(
        amount=parsed_amount,
        currency=currency,
        category=category,
        merchant=_clean_optional_text(data.get("merchant")),
        description=_clean_optional_text(data.get("description")),
        recognized_text=None if is_silence and recognized_text in _SILENCE_MARKERS else recognized_text,
        occurred_on=occurred_on,
        timestamp=timestamp,
        uncertain_fields=uncertain_fields,
        has_low_confidence=has_low_confidence,
    )


class VoiceQuotaTracker:
    """Thread-safe daily Voice Capture quota tracker keyed by Asia/Ho_Chi_Minh date."""

    def __init__(
        self,
        *,
        per_user_daily_limit: int = 10,
        service_daily_limit: int = 100,
        clock: Callable[[], dt.datetime] | None = None,
    ) -> None:
        if per_user_daily_limit <= 0 or service_daily_limit <= 0:
            raise ValueError("Daily voice capture limits must be positive integers.")
        self._per_user_daily_limit = per_user_daily_limit
        self._service_daily_limit = service_daily_limit
        self._clock = clock or (lambda: dt.datetime.now(VIETNAM_TZ))
        self._lock = threading.Lock()
        self._current_date: dt.date | None = None
        self._service_count = 0
        self._user_counts: dict[str, int] = {}

    def _local_date(self) -> dt.date:
        return to_vietnam_local_time(self._clock()).date()

    def consume(self, user_id: str) -> None:
        """Reserve one daily Voice Capture slot for user_id or fail closed with 429."""
        local_date = self._local_date()
        with self._lock:
            if local_date != self._current_date:
                self._current_date = local_date
                self._service_count = 0
                self._user_counts.clear()

            user_count = self._user_counts.get(user_id, 0)
            if user_count >= self._per_user_daily_limit:
                raise ApiHttpError(
                    429,
                    "VOICE_RATE_LIMITED",
                    "Daily voice capture limit reached for this student.",
                )
            if self._service_count >= self._service_daily_limit:
                raise ApiHttpError(
                    429,
                    "VOICE_RATE_LIMITED",
                    "Daily voice capture service quota reached.",
                )

            self._user_counts[user_id] = user_count + 1
            self._service_count += 1


class VoiceCaptureService:
    """Coordinates audio validation, daily quota, parser invocation, and normalization."""

    def __init__(
        self,
        *,
        parser: VoiceParserProtocol | None = None,
        quota_tracker: VoiceQuotaTracker | None = None,
        storage_hook: VoiceStorageHook | None = None,
        clock: Callable[[], dt.datetime] | None = None,
    ) -> None:
        self._parser: VoiceParserProtocol = parser or UnavailableVoiceParser()
        self._quota_tracker = quota_tracker or VoiceQuotaTracker(clock=clock)
        self._storage_hook = storage_hook
        self._clock = clock or (lambda: dt.datetime.now(VIETNAM_TZ))

    def set_parser(self, parser: VoiceParserProtocol) -> None:
        """Bind or replace the active VoiceParserProtocol implementation."""
        self._parser = parser

    async def process_capture(
        self,
        *,
        user_id: str,
        payload: VoiceCaptureRequest,
    ) -> VoiceCaptureDraft:
        validated = validate_and_strip_voice_audio(
            payload.audio_base64,
            payload.mime_type,
            duration_ms=payload.duration_ms,
        )
        self._quota_tracker.consume(user_id)

        try:
            raw = self._parser.parse(
                validated.audio_bytes,
                validated.mime_type,
                duration_ms=validated.duration_ms,
            )
            if inspect.isawaitable(raw):
                raw = await raw
        except TimeoutError as exc:
            raise ApiHttpError(
                504,
                "VOICE_TIMEOUT",
                "Voice capture processing timed out.",
            ) from exc

        if self._storage_hook is not None:
            stored = self._storage_hook.store(
                user_id=user_id,
                audio_bytes=validated.audio_bytes,
                mime_type=validated.mime_type,
            )
            if inspect.isawaitable(stored):
                await stored

        return normalize_voice_draft(raw, now=self._clock())
