"""Boundary rules for financial input (#56, MU01).

Three layers keep accidental or hostile input from distorting a student's budget:

1. Hard bounds (always rejected, HTTP 422): amounts must be JSON integers between
   1 and ``MAX_AMOUNT_VND`` (the database check from #42). Strings, booleans,
   floats and negatives are refused instead of being coerced.
2. Ledger guards (always rejected): a transaction may not be dated after today in
   Asia/Ho_Chi_Minh, and a student's running income/expense totals may not grow
   beyond ``MAX_LEDGER_TOTAL_VND``, which keeps every derived balance well inside
   the JavaScript safe-integer range the mobile client relies on.
3. Confirmation (MU01): an abnormally large income or expense is only recorded
   when the client resends it with ``confirm_large_amount: true`` after the user
   has confirmed it. Real overspending below the threshold is still recorded
   (plan §7: preserve the record, then help the user reconcile).
"""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from typing import Literal

MAX_AMOUNT_VND = 1_000_000_000_000
MAX_LEDGER_TOTAL_VND = 1_000_000_000_000_000  # < 2**53, the JS safe-integer limit
LARGE_EXPENSE_VND = 5_000_000
LARGE_INCOME_VND = 50_000_000


@dataclass(frozen=True)
class LargeAmount:
    kind: Literal["income", "expense"]
    amount: int
    threshold: int


class FinancialInputError(ValueError):
    """Rejected financial input. ``code`` is stable; ``message`` is safe to show."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def large_amount(kind: Literal["income", "expense"], amount: int) -> LargeAmount | None:
    """Return the threshold an entry crosses, or ``None`` if it is ordinary."""
    threshold = LARGE_EXPENSE_VND if kind == "expense" else LARGE_INCOME_VND
    return LargeAmount(kind, amount, threshold) if amount >= threshold else None


def check_transaction_date(date: dt.date, today: dt.date) -> None:
    if date > today:
        raise FinancialInputError(
            "TRANSACTION_DATE_IN_FUTURE",
            "Transactions cannot be recorded for a future date.",
        )


def check_ledger_totals(total_income: int, total_expense: int) -> None:
    if max(total_income, total_expense) > MAX_LEDGER_TOTAL_VND:
        raise FinancialInputError(
            "LEDGER_LIMIT_EXCEEDED",
            "This entry would push the ledger beyond the supported range.",
        )


def format_vnd(amount: int) -> str:
    return f"{amount:,}".replace(",", ".") + " ₫"
