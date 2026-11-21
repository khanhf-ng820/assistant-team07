from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

_SCRIPT_PATH = Path(__file__).resolve().parents[3] / "scripts" / "check_openapi_contracts.py"
_SPEC = importlib.util.spec_from_file_location("check_openapi_contracts", _SCRIPT_PATH)
assert _SPEC and _SPEC.loader
_MODULE = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(_MODULE)


def test_parse_ts_contracts_supports_type_aliases_and_interfaces_ignoring_comments():
    source = """
    // Single-line object type alias as in apps/mobile/src/api/health.ts
    export type HealthResponse = { status: 'ok'; service: 'carenta-api' };

    /* multi-line: ignored
       fakeField: string;
    */
    export interface SampleDto {
      readonly id: string;
      amount: number;
      note?: string | null;
    }
    """
    parsed = _MODULE.parse_ts_contracts(source)
    assert parsed == {
        "HealthResponse": {"status", "service"},
        "SampleDto": {"id", "amount", "note"},
    }


def test_check_contracts_passes_when_aligned_and_raises_on_field_drift():
    fake_openapi = {
        "paths": {"/health": {"get": {"responses": {"200": {"content": {"application/json": {"schema": {"$ref": "#/components/schemas/HealthResponse"}}}}}}}},
        "components": {
            "schemas": {
                "HealthResponse": {"properties": {"status": {}, "service": {}}},
                "SampleDto": {"properties": {"id": {}, "amount": {}}},
            }
        },
    }
    aligned = _MODULE.check_contracts(
        fake_openapi,
        {"HealthResponse": {"status", "service"}, "SampleDto": {"id", "amount"}},
    )
    assert aligned == ["HealthResponse", "SampleDto"]

    with pytest.raises(ValueError, match="Contract drift in SampleDto"):
        _MODULE.check_contracts(
            fake_openapi,
            {"HealthResponse": {"status", "service"}, "SampleDto": {"id"}},
        )

    with pytest.raises(ValueError, match="TypeScript contract missing 'HealthResponse'"):
        _MODULE.check_contracts(fake_openapi, {})
