import csv
from pathlib import Path
from assistant.rules import reply

ROOT = Path(__file__).resolve().parents[1]
CASES_PATH = ROOT / "eval" / "cases.csv"


def test_cases_csv_exists_and_valid():
    assert CASES_PATH.is_file(), f"Missing benchmark file: {CASES_PATH}"
    with CASES_PATH.open(encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        assert reader.fieldnames == ["question", "expected", "category"]
        rows = list(reader)
        assert len(rows) >= 15


def test_cases_count_and_edge_cases():
    with CASES_PATH.open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f))

    assert len(rows) == 15
    edge_cases = [r for r in rows if r["category"] == "edge"]
    assert len(edge_cases) >= 3, f"Expected at least 3 edge cases, got {len(edge_cases)}"


def test_cases_expected_answers_match_reply():
    with CASES_PATH.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            actual = reply(row["question"])
            assert actual == row["expected"], f"Mismatch for {row['question']!r}: {actual!r} != {row['expected']!r}"
