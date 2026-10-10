"""Unit tests for Python Bootcamp W1 — Đặng Xuân Phát (phat_dx).

Covers all five exercises with edge-case and happy-path tests.
Run: pytest python-bootcamp/members/phat_dx/w1/test_w1.py -v
"""

import pytest

from .grades import summary
from .text_tools import top_k, word_count
from .rules import can_register_thesis, missing
from .translate import sieve_of_eratosthenes
from .timetable import by_day


# ── W1-1 grades ──────────────────────────────────────────────────────

class TestSummary:
    def test_basic(self):
        result = summary([7, 8, 9, 10, 6])
        assert result == {"min": 6.0, "max": 10.0, "mean": 8.0, "median": 8.0}

    def test_single_element(self):
        result = summary([5.5])
        assert result == {"min": 5.5, "max": 5.5, "mean": 5.5, "median": 5.5}

    def test_even_count_median(self):
        result = summary([1, 2, 3, 4])
        assert result["median"] == 2.5

    def test_empty_raises(self):
        with pytest.raises(ValueError):
            summary([])


# ── W1-2 text_tools ─────────────────────────────────────────────────

class TestWordCount:
    def test_basic(self):
        assert word_count("Hello hello world") == {"hello": 2, "world": 1}

    def test_punctuation_ignored(self):
        counts = word_count("yes! yes? no.")
        assert counts == {"yes": 2, "no": 1}

    def test_empty_string(self):
        assert word_count("") == {}


class TestTopK:
    def test_basic(self):
        assert top_k("a b a c b a", 2) == [("a", 3), ("b", 2)]

    def test_alphabetical_tiebreak(self):
        result = top_k("x y x y z z", 3)
        # all have count 2 → alphabetical order
        assert result == [("x", 2), ("y", 2), ("z", 2)]

    def test_k_larger_than_vocab(self):
        result = top_k("one two", 10)
        assert len(result) == 2


# ── W1-3 rules ──────────────────────────────────────────────────────

class TestCanRegister:
    def test_eligible(self):
        assert can_register_thesis(120, 2.0) is True

    def test_low_credits(self):
        assert can_register_thesis(100, 3.0) is False

    def test_low_gpa(self):
        assert can_register_thesis(130, 1.5) is False

    def test_both_low(self):
        assert can_register_thesis(50, 1.0) is False


class TestMissing:
    def test_fully_eligible(self):
        assert missing(130, 3.5) == []

    def test_credits_only(self):
        reasons = missing(100, 2.5)
        assert len(reasons) == 1
        assert "20 more credits" in reasons[0]

    def test_both_missing(self):
        reasons = missing(100, 1.8)
        assert len(reasons) == 2


# ── W1-4 translate (Sieve of Eratosthenes) ──────────────────────────

class TestSieve:
    def test_primes_to_30(self):
        assert sieve_of_eratosthenes(30) == [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]

    def test_below_2(self):
        assert sieve_of_eratosthenes(1) == []
        assert sieve_of_eratosthenes(0) == []
        assert sieve_of_eratosthenes(-5) == []

    def test_exact_prime(self):
        assert sieve_of_eratosthenes(2) == [2]
        assert sieve_of_eratosthenes(3) == [2, 3]

    def test_large(self):
        primes = sieve_of_eratosthenes(100)
        assert len(primes) == 25  # there are 25 primes <= 100


# ── W1-5 timetable ─────────────────────────────────────────────────

class TestByDay:
    def test_basic_grouping(self):
        entries = [
            ("Monday", "Math", "A101"),
            ("Tuesday", "Physics", "B202"),
            ("Monday", "English", "A102"),
        ]
        result = by_day(entries)
        assert result["Monday"] == [("Math", "A101"), ("English", "A102")]
        assert result["Tuesday"] == [("Physics", "B202")]

    def test_empty_input(self):
        assert by_day([]) == {}

    def test_single_day(self):
        entries = [
            ("Friday", "CS", "C1"),
            ("Friday", "Algo", "C2"),
        ]
        result = by_day(entries)
        assert len(result) == 1
        assert len(result["Friday"]) == 2
