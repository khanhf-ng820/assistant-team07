from pathlib import Path

import pytest

from app.settings import load_supabase_settings

SERVICE_ROOT = Path(__file__).resolve().parents[1]
MOBILE_ROOT = SERVICE_ROOT.parents[1] / "apps" / "mobile"

CONFIGURED = {
    "SUPABASE_URL": "https://example-ref.supabase.co",
    "SUPABASE_ANON_KEY": "anon-test-value",
    "SUPABASE_SERVICE_ROLE_KEY": "service-role-test-value",
}


def test_unconfigured_environment_returns_none():
    assert load_supabase_settings({}) is None


def test_loads_settings_without_exposing_secrets():
    settings = load_supabase_settings(CONFIGURED)
    assert settings is not None
    assert settings.url == CONFIGURED["SUPABASE_URL"]
    assert settings.service_role_key.get_secret_value() == "service-role-test-value"
    text = repr(settings) + str(settings)
    assert "service-role-test-value" not in text
    assert "anon-test-value" not in text


def test_partial_configuration_names_missing_variable_only():
    env = {**CONFIGURED, "SUPABASE_SERVICE_ROLE_KEY": " "}
    with pytest.raises(ValueError, match="SUPABASE_SERVICE_ROLE_KEY") as error:
        load_supabase_settings(env)
    assert "anon-test-value" not in str(error.value)


def test_rejects_non_https_url():
    with pytest.raises(ValueError, match="https"):
        load_supabase_settings({**CONFIGURED, "SUPABASE_URL": "http://example.test"})


def test_backend_env_file_is_ignored_and_example_has_placeholders_only():
    ignored = (SERVICE_ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
    assert ".env" in ignored
    example = (SERVICE_ROOT / ".env.example").read_text(encoding="utf-8")
    assert "SUPABASE_SERVICE_ROLE_KEY=replace-with-service-role-key" in example


def test_mobile_app_never_references_backend_supabase_secrets():
    files = [p for p in MOBILE_ROOT.rglob("*") if p.is_file()
             and "node_modules" not in p.parts and p.suffix in {".ts", ".tsx", ".js", ".json", ".example"}]
    assert files
    for path in files:
        text = path.read_text(encoding="utf-8", errors="ignore")
        assert "SERVICE_ROLE" not in text.upper(), path
