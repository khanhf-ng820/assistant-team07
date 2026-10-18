"""Run the evaluation benchmark:  python eval/run.py

Prints the accuracy of assistant.rules.reply on eval/cases.csv.
"""
from __future__ import annotations

import csv
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # repository root
sys.path.insert(0, str(ROOT / "src"))

from assistant.rules import reply  # noqa: E402


def main() -> None:
    cases_path = ROOT / "eval" / "cases.csv"
    if not cases_path.exists():
        print(f"Missing benchmark file: {cases_path}")
        print("Create eval/cases.csv first (see issue #11).")
        raise SystemExit(1)

    total = 0
    correct = 0
    with cases_path.open(encoding="utf-8", newline="") as f:
        for row in csv.DictReader(f):
            total += 1
            actual = reply(row["question"])
            if actual == row["expected"]:
                correct += 1
            else:
                print(f"MISMATCH: {row['question']!r}")
                print(f"  expected: {row['expected']!r}")
                print(f"  actual:   {actual!r}")

    accuracy = correct / total * 100 if total else 0.0
    print(f"Accuracy: {correct}/{total} ({accuracy:.1f}%)")


if __name__ == "__main__":
    main()
