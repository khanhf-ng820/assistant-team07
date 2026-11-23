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


def test_find_skipped_schemas_reports_unmatched_openapi_and_ts_contracts(capsys, monkeypatch):
    fake_openapi = {
        "paths": {"/health": {"get": {"responses": {"200": {"content": {"application/json": {"schema": {"$ref": "#/components/schemas/HealthResponse"}}}}}}}},
        "components": {
            "schemas": {
                "HealthResponse": {"properties": {"status": {}, "service": {}}},
                "UnmappedApiSchema": {"properties": {"id": {}}},
            }
        },
    }
    ts_contracts = {
        "HealthResponse": {"status", "service"},
        "LocalOnlyTsContract": {"foo"},
    }
    skipped_openapi, skipped_ts = _MODULE.find_skipped_schemas(fake_openapi, ts_contracts)
    assert skipped_openapi == ["UnmappedApiSchema"]
    assert skipped_ts == ["LocalOnlyTsContract"]

    monkeypatch.setattr(_MODULE, "create_app", lambda: type("FakeApp", (), {"openapi": lambda self: fake_openapi})())
    monkeypatch.setattr(_MODULE, "load_ts_contracts", lambda: ts_contracts)
    assert _MODULE.main() == 0
    captured = capsys.readouterr().out
    assert "OpenAPI contract check passed (1 schemas: HealthResponse)." in captured
    assert "Skipped OpenAPI schemas not in TypeScript (1): UnmappedApiSchema" in captured
    assert "Skipped TypeScript contracts not in OpenAPI (1): LocalOnlyTsContract" in captured

