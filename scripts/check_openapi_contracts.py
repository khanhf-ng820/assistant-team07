#!/usr/bin/env python3
"""Verify alignment between FastAPI OpenAPI schemas and mobile TypeScript contracts."""

from __future__ import annotations

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
API_ROOT = REPO_ROOT / "services" / "carenta-api"
MOBILE_API_DIR = REPO_ROOT / "apps" / "mobile" / "src" / "api"

sys.path.insert(0, str(API_ROOT))
from app.main import create_app  # noqa: E402


_INTERFACE_RE = re.compile(
    r"export\s+interface\s+([A-Za-z0-9_]+)\s*\{([^}]*)\}", re.MULTILINE
)
_FIELD_RE = re.compile(r"^\s*([A-Za-z0-9_]+)\??\s*:", re.MULTILINE)


def parse_ts_interfaces(source: str) -> dict[str, set[str]]:
    interfaces: dict[str, set[str]] = {}
    for match in _INTERFACE_RE.finditer(source):
        name = match.group(1)
        body = match.group(2)
        interfaces[name] = set(_FIELD_RE.findall(body))
    return interfaces


def main() -> int:
    openapi = create_app().openapi()
    paths = openapi.get("paths", {})
    if "/health" not in paths:
        print("ERROR: OpenAPI schema is missing '/health' path.", file=sys.stderr)
        return 1

    schemas = openapi.get("components", {}).get("schemas", {})
    health_props = set(schemas.get("HealthResponse", {}).get("properties", {}).keys())
    if health_props != {"status", "service"}:
        print(
            f"ERROR: HealthResponse OpenAPI properties mismatch: got {sorted(health_props)}",
            file=sys.stderr,
        )
        return 1

    health_ts_path = MOBILE_API_DIR / "health.ts"
    if not health_ts_path.exists():
        print("ERROR: missing apps/mobile/src/api/health.ts", file=sys.stderr)
        return 1
    health_ts = health_ts_path.read_text(encoding="utf-8")
    for field in ("status", "service"):
        if field not in health_ts:
            print(
                f"ERROR: '{field}' missing from apps/mobile/src/api/health.ts",
                file=sys.stderr,
            )
            return 1

    verified = ["HealthResponse"]
    contracts_path = MOBILE_API_DIR / "contracts.ts"
    if contracts_path.exists():
        ts_interfaces = parse_ts_interfaces(contracts_path.read_text(encoding="utf-8"))
        for schema_name, schema_def in sorted(schemas.items()):
            if schema_name not in ts_interfaces:
                continue
            api_fields = set(schema_def.get("properties", {}).keys())
            ts_fields = ts_interfaces[schema_name]
            if api_fields != ts_fields:
                missing_in_ts = sorted(api_fields - ts_fields)
                extra_in_ts = sorted(ts_fields - api_fields)
                print(
                    f"ERROR: Contract drift in {schema_name}: missing_in_ts={missing_in_ts}, extra_in_ts={extra_in_ts}",
                    file=sys.stderr,
                )
                return 1
            if schema_name not in verified:
                verified.append(schema_name)

    print(f"OpenAPI contract check passed ({len(verified)} schemas: {', '.join(verified)}).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
