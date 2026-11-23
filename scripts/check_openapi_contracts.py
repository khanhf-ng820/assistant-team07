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

_DECL_START_RE = re.compile(
    r"export\s+(?:interface\s+([A-Za-z0-9_]+)|type\s+([A-Za-z0-9_]+)\s*=)\s*\{"
)
_FIELD_RE = re.compile(
    r"(?:^|[;\n])\s*(?:readonly\s+)?([A-Za-z0-9_]+)\??\s*:", re.MULTILINE
)


def _strip_ts_comments(source: str) -> str:
    no_block = re.sub(r"/\*.*?\*/", "", source, flags=re.DOTALL)
    return re.sub(r"//[^\n]*", "", no_block)


def _extract_brace_block(source: str, open_brace_idx: int) -> str | None:
    depth = 0
    for idx in range(open_brace_idx, len(source)):
        ch = source[idx]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return source[open_brace_idx + 1 : idx]
    return None


def parse_ts_contracts(source: str) -> dict[str, set[str]]:
    """Parse top-level property names from exported TS interfaces and object type aliases."""
    cleaned = _strip_ts_comments(source)
    contracts: dict[str, set[str]] = {}
    for match in _DECL_START_RE.finditer(cleaned):
        name = match.group(1) or match.group(2)
        brace_idx = match.end() - 1
        block = _extract_brace_block(cleaned, brace_idx)
        if name and block is not None:
            contracts[name] = set(_FIELD_RE.findall(block))
    return contracts


def check_contracts(openapi: dict, ts_contracts: dict[str, set[str]]) -> list[str]:
    """Compare FastAPI OpenAPI schemas against parsed mobile TypeScript contracts."""
    paths = openapi.get("paths", {})
    if "/health" not in paths:
        raise ValueError("OpenAPI schema is missing '/health' path.")

    health_ref = (
        paths.get("/health", {})
        .get("get", {})
        .get("responses", {})
        .get("200", {})
        .get("content", {})
        .get("application/json", {})
        .get("schema", {})
        .get("$ref", "")
    )
    if not isinstance(health_ref, str) or not health_ref.startswith("#/components/schemas/"):
        raise ValueError(f"OpenAPI /health 200 response missing schema $ref: {health_ref!r}")

    health_schema_name = health_ref.rsplit("/", 1)[-1]
    schemas = openapi.get("components", {}).get("schemas", {})
    if health_schema_name not in ts_contracts:
        raise ValueError(f"TypeScript contract missing '{health_schema_name}'.")

    verified: list[str] = []
    for schema_name, schema_def in sorted(schemas.items()):
        if schema_name not in ts_contracts:
            continue
        api_fields = set(schema_def.get("properties", {}).keys())
        ts_fields = ts_contracts[schema_name]
        if api_fields != ts_fields:
            missing_in_ts = sorted(api_fields - ts_fields)
            extra_in_ts = sorted(ts_fields - api_fields)
            raise ValueError(
                f"Contract drift in {schema_name}: missing_in_ts={missing_in_ts}, extra_in_ts={extra_in_ts}"
            )
        verified.append(schema_name)

    return verified


def find_skipped_schemas(openapi: dict, ts_contracts: dict[str, set[str]]) -> tuple[list[str], list[str]]:
    """Return sorted lists of OpenAPI schemas missing in TS and TS contracts missing in OpenAPI."""
    schemas = openapi.get("components", {}).get("schemas", {})
    openapi_names = set(schemas.keys())
    ts_names = set(ts_contracts.keys())
    skipped_openapi = sorted(openapi_names - ts_names)
    skipped_ts = sorted(ts_names - openapi_names)
    return skipped_openapi, skipped_ts


def load_ts_contracts() -> dict[str, set[str]]:
    ts_contracts: dict[str, set[str]] = {}
    for filename in ("health.ts", "contracts.ts"):
        path = MOBILE_API_DIR / filename
        if path.exists():
            ts_contracts.update(parse_ts_contracts(path.read_text(encoding="utf-8")))
    return ts_contracts


def main() -> int:
    openapi = create_app().openapi()
    ts_contracts = load_ts_contracts()

    try:
        verified = check_contracts(openapi, ts_contracts)
    except ValueError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    print(f"OpenAPI contract check passed ({len(verified)} schemas: {', '.join(verified)}).")
    skipped_openapi, skipped_ts = find_skipped_schemas(openapi, ts_contracts)
    if skipped_openapi:
        print(f"Skipped OpenAPI schemas not in TypeScript ({len(skipped_openapi)}): {', '.join(skipped_openapi)}")
    if skipped_ts:
        print(f"Skipped TypeScript contracts not in OpenAPI ({len(skipped_ts)}): {', '.join(skipped_ts)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
