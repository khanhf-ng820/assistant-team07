"""Conservative daily-spending pattern detection from confirmed expenses."""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import unicodedata
from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping

from pydantic import BaseModel, Field

from app.schemas import TransactionResponse

HISTORY_DAYS = 7
MIN_MATCHING_DAYS = 5
MIN_CONFIDENCE = 0.80
DISMISSAL_DAYS = 7

HabitKey = tuple[str, str]


class HabitSuggestion(BaseModel):
    id: str
    date: dt.date
    amount: int = Field(gt=0)
    category: str
    note: str
    confidence: float = Field(ge=0, le=1)
    matching_days: int = Field(ge=MIN_MATCHING_DAYS, le=HISTORY_DAYS)


class HabitSuggestionResponse(BaseModel):
    suggestion: HabitSuggestion | None


def detect_habit(
    expenses: Iterable[TransactionResponse],
    *,
    owner_id: str,
    today: dt.date,
    dismissed_until: Mapping[HabitKey, dt.date],
) -> tuple[HabitSuggestion, HabitKey] | None:
    """Select one recurring expense whose amount and label are well supported."""
    first_day = today - dt.timedelta(days=HISTORY_DAYS)
    recent_day = today - dt.timedelta(days=2)
    groups: dict[HabitKey, dict[dt.date, list[TransactionResponse]]] = defaultdict(lambda: defaultdict(list))
    recorded_today: set[HabitKey] = set()

    for transaction in expenses:
        if transaction.kind != "expense" or not first_day <= transaction.date <= today:
            continue
        note = " ".join(unicodedata.normalize("NFKC", transaction.note or "").split()).casefold()
        if len(note) < 2:
            continue
        key = (transaction.category, note)
        if transaction.date == today:
            recorded_today.add(key)
        else:
            groups[key][transaction.date].append(transaction)

    candidates: list[tuple[HabitSuggestion, HabitKey]] = []
    for key, days in groups.items():
        if key in recorded_today or dismissed_until.get(key, today) > today:
            continue

        # Multiple purchases on one day do not establish a single daily price.
        unambiguous = [daily[0] for daily in days.values() if len(daily) == 1]
        if len(unambiguous) < MIN_MATCHING_DAYS:
            continue
        amount, matching_days = Counter(item.amount for item in unambiguous).most_common(1)[0]
        if matching_days < MIN_MATCHING_DAYS:
            continue
        most_recent = max((item for item in unambiguous if item.amount == amount), key=lambda item: item.date)
        coverage = matching_days / HISTORY_DAYS
        stability = matching_days / len(days)
        confidence = round(0.7 * coverage + 0.3 * stability, 2)
        if most_recent.date < recent_day or confidence < MIN_CONFIDENCE:
            continue

        identity = json.dumps((owner_id, today.isoformat(), *key, amount), ensure_ascii=False)
        candidates.append((HabitSuggestion(
            id=hashlib.sha256(identity.encode("utf-8")).hexdigest(),
            date=today,
            amount=amount,
            category=key[0],
            note=most_recent.note or key[1],
            confidence=confidence,
            matching_days=matching_days,
        ), key))

    if not candidates:
        return None
    return min(candidates, key=lambda item: (-item[0].confidence, item[1]))
