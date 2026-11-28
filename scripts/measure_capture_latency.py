"""Measure the API leg of the quick-capture flow (issue #53).

Acceptance criterion: a capture interaction must finish logging the transaction
within 5 seconds. This script measures only the part a script can: the time for
``POST /v1/transactions`` to return, repeated N times with unique idempotency
keys. It does NOT measure app launch, deep-link handling or UI interaction; use
the manual stopwatch procedure in ``apps/mobile/README.md`` for those.

Records written here are synthetic and carry a ``latency-probe`` note. Run it
against a local development API only, never against a real user's data.

Usage (API running on port 8000):
    python scripts/measure_capture_latency.py --base-url http://127.0.0.1:8000 --runs 20
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import statistics
import sys
import time
import urllib.error
import urllib.request
import uuid

LIMIT_SECONDS = 5.0


def summarize(samples: list[float], limit: float = LIMIT_SECONDS) -> dict:
    """Return min/median/p95/max (seconds) and whether every sample met the limit."""
    if not samples:
        raise ValueError("no samples to summarize")
    ordered = sorted(samples)
    p95_index = max(0, min(len(ordered) - 1, math.ceil(0.95 * len(ordered)) - 1))
    return {
        "runs": len(ordered),
        "min": ordered[0],
        "median": statistics.median(ordered),
        "p95": ordered[p95_index],
        "max": ordered[-1],
        "limit": limit,
        "passed": ordered[-1] <= limit,
    }


LOCAL_TZ = dt.timezone(dt.timedelta(hours=7))


def post_transaction(base_url: str, timeout: float) -> float:
    """Create one synthetic expense and return the elapsed seconds."""
    payload = {
        "amount": 1000,
        "kind": "expense",
        "category": "latency-probe",
        "date": dt.datetime.now(LOCAL_TZ).date().isoformat(),
        "note": "latency-probe",
        "idempotency_key": f"latency-{uuid.uuid4()}",
    }
    request = urllib.request.Request(
        f"{base_url.rstrip('/')}/v1/transactions",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    started = time.perf_counter()
    with urllib.request.urlopen(request, timeout=timeout) as response:
        response.read()
        if response.status != 201:
            raise RuntimeError(f"unexpected status {response.status}")
    return time.perf_counter() - started


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--runs", type=int, default=20)
    parser.add_argument("--timeout", type=float, default=LIMIT_SECONDS)
    args = parser.parse_args(argv)

    if args.runs < 1:
        parser.error("--runs must be at least 1")

    samples: list[float] = []
    for _ in range(args.runs):
        try:
            samples.append(post_transaction(args.base_url, args.timeout))
        except (urllib.error.URLError, RuntimeError, TimeoutError) as exc:
            print(f"FAILED: request error: {exc}", file=sys.stderr)
            return 2

    result = summarize(samples)
    print(json.dumps({k: round(v, 4) if isinstance(v, float) else v for k, v in result.items()}, indent=2))
    print("PASS" if result["passed"] else f"FAIL: slowest run exceeded {LIMIT_SECONDS:.0f}s")
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
