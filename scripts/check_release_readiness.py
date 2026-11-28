#!/usr/bin/env python3
"""Deterministic release-readiness verification gate for CARENTA Phase 1-3 subsystems."""

from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path

import httpx

REPO_ROOT = Path(__file__).resolve().parent.parent
API_ROOT = REPO_ROOT / "services" / "carenta-api"

if str(API_ROOT) not in sys.path:
    sys.path.insert(0, str(API_ROOT))

from app.auth import AuthConfig  # noqa: E402
from app.main import create_app  # noqa: E402
from app.repository import InMemoryRepository  # noqa: E402
from app.settings import SchedulerSettings  # noqa: E402

_SECRET_PLACEHOLDER_PREFIXES = ("replace-with-", "your-", "example-")
_SENSITIVE_ENV_KEYS = frozenset(
    {
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_JWT_SECRET",
        "CARENTA_SCHEDULER_SECRET",
        "GEMINI_API_KEY",
    }
)


def _load_openapi_checker():
    checker_path = REPO_ROOT / "scripts" / "check_openapi_contracts.py"
    spec = importlib.util.spec_from_file_location("check_openapi_contracts", checker_path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def validate_env_example(path: Path) -> list[str]:
    """Ensure .env.example contains no uncommented real secrets."""
    if not path.exists():
        return [f"Missing env example file: {path}"]
    errors: list[str] = []
    for line_no, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip()
        if key in _SENSITIVE_ENV_KEYS and value and not value.startswith(_SECRET_PLACEHOLDER_PREFIXES):
            errors.append(f"{path.name}:{line_no} exposes non-placeholder value for {key}")
    return errors


async def _verify_unconfigured_asgi_posture() -> list[str]:
    errors: list[str] = []
    app = create_app(
        auth_config=AuthConfig(local_dev_auth=False),
        repository=InMemoryRepository(),
        scheduler_settings=SchedulerSettings(enabled=False, scheduler_secret=None),
    )
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        health = await client.get("/health")
        if health.status_code != 200 or health.json() != {"status": "ok", "service": "carenta-api"}:
            errors.append(f"/health failed readiness check: {health.status_code}")

        ready = await client.get("/ready")
        if ready.status_code != 200 or "service" not in ready.json():
            errors.append(f"/ready failed readiness check: {ready.status_code}")

        for path in ("/api/v1/assistant/snapshot", "/api/v1/jobs/status", "/api/v1/transactions"):
            res = await client.get(path)
            if res.status_code != 401:
                errors.append(f"Protected route {path} did not fail closed with 401 (got {res.status_code})")

        cron_res = await client.post("/api/v1/internal/jobs/evening_reminder/run")
        if cron_res.status_code != 503:
            errors.append(
                f"Internal scheduler route did not fail closed with 503 when unset (got {cron_res.status_code})"
            )
    return errors


def main() -> int:
    checker = _load_openapi_checker()
    openapi = create_app().openapi()
    ts_contracts = checker.load_ts_contracts()
    verified = checker.check_contracts(openapi, ts_contracts)

    errors: list[str] = []
    errors.extend(validate_env_example(API_ROOT / ".env.example"))
    errors.extend(asyncio.run(_verify_unconfigured_asgi_posture()))

    if errors:
        for err in errors:
            print(f"ERROR: {err}", file=sys.stderr)
        return 1

    print(
        f"Release readiness check passed ({len(verified)} OpenAPI schemas verified; "
        "fail-closed auth, internal scheduler, /health, /ready, and .env.example clean)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
