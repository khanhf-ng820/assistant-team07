"""Live google-genai async speech-to-draft adapter for CARENTA Voice Capture."""

from __future__ import annotations

import asyncio
import datetime as dt
from collections.abc import Callable
from typing import Any

import httpx2
from google import genai
from google.genai import errors as genai_errors, types
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.errors import ApiHttpError
from app.settings import DEFAULT_GEMINI_MODEL, DEFAULT_GEMINI_TIMEOUT_MS, GeminiSettings
from app.voice_capture import VoiceCaptureDraft, normalize_voice_draft, to_vietnam_local_time

_RETRY_STATUS_CODES = [408, 429, 500, 502, 503, 504]
_BLOCKED_FINISH_REASONS = frozenset(
    {
        types.FinishReason.SAFETY,
        types.FinishReason.RECITATION,
        types.FinishReason.BLOCKLIST,
        types.FinishReason.PROHIBITED_CONTENT,
        types.FinishReason.SPII,
        types.FinishReason.IMAGE_SAFETY,
        types.FinishReason.IMAGE_PROHIBITED_CONTENT,
        types.FinishReason.MODEL_ARMOR,
    }
)


class _RawGeminiVoicePayload(BaseModel):
    """Lenient Pydantic envelope for raw Gemini JSON prior to Python domain normalization."""

    model_config = ConfigDict(extra="allow")

    amount: int | float | str | None = None
    currency: str | None = None
    category: str | None = None
    merchant: str | None = None
    description: str | None = None
    recognized_text: str | None = None
    occurred_on: dt.date | str | None = None
    timestamp: dt.datetime | str | None = None
    uncertain_fields: list[str] = Field(default_factory=list)
    has_low_confidence: bool = False


def build_gemini_client(settings: GeminiSettings) -> genai.Client:
    """Create a configured google-genai Client with 20s ms-scoped timeout and capped retries."""
    return genai.Client(
        api_key=settings.api_key.get_secret_value(),
        http_options=types.HttpOptions(
            timeout=settings.timeout_ms,
            retry_options=types.HttpRetryOptions(
                attempts=2,
                initial_delay=0.5,
                max_delay=3.0,
                http_status_codes=_RETRY_STATUS_CODES,
            ),
        ),
    )


def _build_voice_prompt(reference_now: dt.datetime, duration_ms: int | None) -> str:
    duration_hint = f"{duration_ms} ms" if duration_ms is not None else "unknown"
    return (
        "You are a Vietnamese student expense transcription and extraction parser for CARENTA.\n"
        f"Reference local date/time: {reference_now.strftime('%Y-%m-%d %H:%M')} "
        "(timezone: Asia/Ho_Chi_Minh, +07:00).\n"
        f"Audio duration hint: {duration_hint}.\n"
        "Extract at most ONE single-purchase Vietnamese expense into JSON matching the schema:\n"
        "- recognized_text: verbatim Vietnamese transcript of the spoken clip (or null if silent/noise).\n"
        "- amount: positive integer VND (e.g. '35k' -> 35000, 'một triệu hai' -> 1200000), or null.\n"
        "- currency: 'VND' when amount is known, otherwise null.\n"
        "- category: strictly one of 'food', 'transport', 'shopping', 'bills', "
        "'education', 'entertainment', 'other', or null if unclear.\n"
        "- merchant: short merchant/place name if spoken, otherwise null.\n"
        "- description: short Vietnamese expense description, otherwise null.\n"
        "- occurred_on: YYYY-MM-DD in Asia/Ho_Chi_Minh (resolve 'hôm nay', 'hôm qua', 'hôm kia' "
        "against reference date).\n"
        "- timestamp: ISO-8601 datetime with +07:00 ONLY if a clock time is explicitly spoken; "
        "otherwise null.\n"
        "- uncertain_fields: list of field names with uncertainty (e.g. ['amount']).\n"
        "- has_low_confidence: true if silent, negated/not purchased (e.g. 'không mua cà phê'), "
        "missing/ambiguous amount, or multiple separate purchases are spoken.\n"
        "Rules: Never invent missing amounts or merchants. If the clip is silence, noise, "
        "negation/non-purchase, missing an amount, or describes multiple separate purchases, "
        "set amount=null, currency=null, has_low_confidence=true, and include 'amount' in uncertain_fields."
    )


def _unresolved_draft(reference_now: dt.datetime) -> VoiceCaptureDraft:
    return normalize_voice_draft(
        {"uncertain_fields": ["amount"], "has_low_confidence": True},
        now=reference_now,
    )


def _extract_candidate_json_text(response: Any) -> str | None:
    prompt_feedback = getattr(response, "prompt_feedback", None)
    if getattr(prompt_feedback, "block_reason", None) is not None:
        return None

    candidates = getattr(response, "candidates", None)
    if not candidates:
        return None

    finish_reason = getattr(candidates[0], "finish_reason", None)
    if finish_reason in _BLOCKED_FINISH_REASONS:
        return None

    raw_text = (getattr(response, "text", None) or "").strip()
    return raw_text or None


def _map_upstream_api_error(exc: genai_errors.APIError) -> ApiHttpError:
    status_code = getattr(exc, "code", None)
    if status_code == 429:
        return ApiHttpError(
            429,
            "VOICE_RATE_LIMITED",
            "Voice parsing provider rate limit reached.",
        )
    if status_code == 503:
        return ApiHttpError(
            503,
            "VOICE_PROVIDER_UNAVAILABLE",
            "Voice parsing provider is temporarily unavailable.",
        )
    if status_code in {408, 504}:
        return ApiHttpError(
            504,
            "VOICE_TIMEOUT",
            "Voice capture processing timed out.",
        )
    return ApiHttpError(
        502,
        "VOICE_PROVIDER_ERROR",
        "Voice parsing provider failed to process audio.",
    )


class GeminiVoiceParser:
    """Async VoiceParserProtocol implementation backed by google-genai inline audio bytes."""

    def __init__(
        self,
        *,
        client: Any | None = None,
        settings: GeminiSettings | None = None,
        model: str | None = None,
        timeout_seconds: float | None = None,
        clock: Callable[[], dt.datetime] | None = None,
    ) -> None:
        if client is None and settings is None:
            raise ValueError("Either client or settings must be provided to GeminiVoiceParser.")
        self._client = client if client is not None else build_gemini_client(settings)  # type: ignore[arg-type]
        self._model = model or (settings.model if settings is not None else DEFAULT_GEMINI_MODEL)
        default_timeout_ms = settings.timeout_ms if settings is not None else DEFAULT_GEMINI_TIMEOUT_MS
        self._timeout_seconds = (
            timeout_seconds if timeout_seconds is not None else default_timeout_ms / 1000.0
        )
        self._clock = clock

    async def parse(
        self,
        audio_bytes: bytes,
        mime_type: str,
        *,
        duration_ms: int | None = None,
    ) -> VoiceCaptureDraft:
        reference_now = to_vietnam_local_time(self._clock() if self._clock is not None else None)
        prompt = _build_voice_prompt(reference_now, duration_ms)
        audio_part = types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)

        try:
            async with asyncio.timeout(self._timeout_seconds):
                response = await self._client.aio.models.generate_content(
                    model=self._model,
                    contents=[prompt, audio_part],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema=VoiceCaptureDraft,
                        temperature=0,
                    ),
                )
        except (TimeoutError, httpx2.TimeoutException) as exc:
            raise ApiHttpError(
                504,
                "VOICE_TIMEOUT",
                "Voice capture processing timed out.",
            ) from exc
        except genai_errors.APIError as exc:
            raise _map_upstream_api_error(exc) from exc
        except (httpx2.HTTPError, OSError) as exc:
            raise ApiHttpError(
                502,
                "VOICE_PROVIDER_ERROR",
                "Voice parsing provider failed to process audio.",
            ) from exc

        raw_text = _extract_candidate_json_text(response)
        if raw_text is None:
            return _unresolved_draft(reference_now)

        try:
            parsed = _RawGeminiVoicePayload.model_validate_json(raw_text)
        except ValidationError as exc:
            raise ApiHttpError(
                502,
                "VOICE_PROVIDER_ERROR",
                "Voice parsing provider returned an invalid response.",
            ) from exc
        return normalize_voice_draft(parsed.model_dump(), now=reference_now)
