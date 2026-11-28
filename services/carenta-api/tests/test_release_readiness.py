"""Regression tests for scripts/check_release_readiness.py (#121)."""

from __future__ import annotations

import importlib.util
from pathlib import Path

_SCRIPT_PATH = Path(__file__).resolve().parents[3] / "scripts" / "check_release_readiness.py"


def _load_readiness_module():
    spec = importlib.util.spec_from_file_location("check_release_readiness", _SCRIPT_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_release_readiness_gate_passes_on_clean_repo(monkeypatch):
    for var in (
        "SUPABASE_URL",
        "SUPABASE_JWT_SECRET",
        "CARENTA_LOCAL_DEV_AUTH",
        "CARENTA_SCHEDULER_SECRET",
        "CARENTA_SCHEDULER_ENABLED",
    ):
        monkeypatch.delenv(var, raising=False)

    module = _load_readiness_module()
    assert module.main() == 0


def test_release_readiness_rejects_uncommented_secret_in_env_example(tmp_path):
    module = _load_readiness_module()
    bad_env = tmp_path / ".env.example"
    bad_env.write_text("CARENTA_SCHEDULER_SECRET=real-secret-value\n", encoding="utf-8")
    errors = module.validate_env_example(bad_env)
    assert any("CARENTA_SCHEDULER_SECRET" in err for err in errors)
