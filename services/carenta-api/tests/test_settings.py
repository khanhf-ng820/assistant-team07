import asyncio
import datetime as dt
import json
from dataclasses import dataclass
from pathlib import Path

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec

from app.auth import SupabaseTokenVerifier, load_auth_config
from app.main import create_app
from app.repository import InMemoryRepository
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


@dataclass
class _StubSigningKey:
    key: object


class _StubJwkClient:
    def __init__(self, public_jwk: dict[str, object]) -> None:
        self._public_key = jwt.PyJWK.from_dict(public_jwk).key

    def get_signing_key_from_jwt(self, _token: str) -> _StubSigningKey:
        return _StubSigningKey(key=self._public_key)


def _get(app, path: str, headers: dict[str, str] | None = None):
    async def run():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.get(path, headers=headers)

    return asyncio.run(run())


def test_jwt_only_supabase_url_starts_app_and_verifies_jwt_without_db_keys(
    monkeypatch: pytest.MonkeyPatch,
):
    for name in (
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "SUPABASE_JWT_SECRET",
        "CARENTA_LOCAL_DEV_AUTH",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("SUPABASE_URL", "https://proj.supabase.co")

    auth_config = load_auth_config()
    assert auth_config.local_dev_auth is False
    assert auth_config.supabase_url == "https://proj.supabase.co"

    private_key = ec.generate_private_key(ec.SECP256R1())
    public_jwk = json.loads(jwt.algorithms.ECAlgorithm.to_jwk(private_key.public_key()))
    now = dt.datetime.now(dt.timezone.utc)
    token = jwt.encode(
        {
            "sub": "student-jwt-only",
            "email": "jwt@hcmus.edu.vn",
            "role": "authenticated",
            "aud": "authenticated",
            "iss": "https://proj.supabase.co/auth/v1",
            "iat": int(now.timestamp()),
            "exp": int((now + dt.timedelta(hours=1)).timestamp()),
        },
        private_key,
        algorithm="ES256",
        headers={"kid": "kid-1"},
    )

    # create_app() reads env via load_auth_config() when auth_config=None
    default_env_app = create_app(repository=InMemoryRepository())
    assert _get(default_env_app, "/api/v1/auth/me").status_code == 401
    assert _get(default_env_app, "/api/v1/transactions").status_code == 401

    verifier = SupabaseTokenVerifier(config=auth_config, jwks_client=_StubJwkClient(public_jwk))
    app = create_app(token_verifier=verifier, repository=InMemoryRepository())
    auth_headers = {"Authorization": f"Bearer {token}"}

    me_res = _get(app, "/api/v1/auth/me", headers=auth_headers)
    tx_res = _get(app, "/api/v1/transactions", headers=auth_headers)
    assert me_res.status_code == 200
    assert me_res.json()["user_id"] == "student-jwt-only"
    assert tx_res.status_code == 200
    assert tx_res.json()["items"] == []

    # Strict DB/admin client loader still refuses partial configuration.
    with pytest.raises(ValueError, match="SUPABASE_ANON_KEY.*SUPABASE_SERVICE_ROLE_KEY"):
        load_supabase_settings()


def test_jwt_secret_only_verifies_hs256_jwt_without_supabase_url(
    monkeypatch: pytest.MonkeyPatch,
):
    secret = "jwt-only-hs256-secret-min-32-bytes-long"
    for name in (
        "SUPABASE_URL",
        "SUPABASE_ANON_KEY",
        "SUPABASE_SERVICE_ROLE_KEY",
        "CARENTA_LOCAL_DEV_AUTH",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("SUPABASE_JWT_SECRET", secret)

    now = dt.datetime.now(dt.timezone.utc)
    token = jwt.encode(
        {
            "sub": "student-hs-only",
            "aud": "authenticated",
            "iat": int(now.timestamp()),
            "exp": int((now + dt.timedelta(hours=1)).timestamp()),
        },
        secret,
        algorithm="HS256",
    )

    app = create_app(repository=InMemoryRepository())
    res = _get(app, "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 200
    assert res.json()["user_id"] == "student-hs-only"
    assert load_supabase_settings() is None
