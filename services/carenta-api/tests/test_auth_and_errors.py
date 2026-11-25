from __future__ import annotations

import asyncio
import datetime as dt
import json
from dataclasses import dataclass

import httpx
import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from pydantic import BaseModel, Field

from app.auth import AuthConfig, SupabaseTokenVerifier, load_auth_config
from app.main import create_app


@dataclass
class _StubSigningKey:
    key: object


class _StubJwkClient:
    def __init__(self, public_jwk: dict[str, object], expected_kid: str = "kid-es256-1") -> None:
        self._public_key = jwt.PyJWK.from_dict(public_jwk).key
        self._expected_kid = expected_kid

    def get_signing_key_from_jwt(self, token: str) -> _StubSigningKey:
        header = jwt.get_unverified_header(token)
        if header.get("kid") != self._expected_kid:
            raise jwt.PyJWKClientError("Unknown key ID")
        return _StubSigningKey(key=self._public_key)


def _request(app, method: str, path: str, headers: dict[str, str] | None = None):
    async def run():
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, path, headers=headers)

    return asyncio.run(run())


def _generate_es256_pair():
    private_key = ec.generate_private_key(ec.SECP256R1())
    jwk_str = jwt.algorithms.ECAlgorithm.to_jwk(private_key.public_key())
    public_jwk = json.loads(jwk_str)
    public_jwk["kid"] = "kid-es256-1"
    public_jwk["alg"] = "ES256"
    return private_key, public_jwk


def _make_claims(
    sub: str | None = "student-123",
    email: str | None = "student@hcmus.edu.vn",
    aud: str = "authenticated",
    iss: str = "https://proj.supabase.co/auth/v1",
    delta_seconds: int = 3600,
) -> dict[str, object]:
    now = dt.datetime.now(dt.timezone.utc)
    claims: dict[str, object] = {
        "aud": aud,
        "iss": iss,
        "exp": int((now + dt.timedelta(seconds=delta_seconds)).timestamp()),
        "iat": int(now.timestamp()),
        "role": "authenticated",
    }
    if sub is not None:
        claims["sub"] = sub
    if email is not None:
        claims["email"] = email
    return claims


def test_protected_auth_me_requires_bearer_token():
    config = AuthConfig(supabase_url="https://proj.supabase.co", jwt_secret="dev-secret-min-32-bytes-long-123456")
    app = create_app(auth_config=config)

    for path in ("/api/v1/auth/me", "/v1/auth/me"):
        response = _request(app, "GET", path, headers={"X-Request-ID": "req-unauth"})
        assert response.status_code == 401
        assert response.headers["x-request-id"] == "req-unauth"
        assert response.json() == {
            "error": {
                "code": "AUTH_REQUIRED",
                "message": "Authentication required.",
                "request_id": "req-unauth",
            }
        }


def test_accepts_valid_es256_jwks_jwt_and_rejects_bad_claims():
    private_key, public_jwk = _generate_es256_pair()
    config = AuthConfig(supabase_url="https://proj.supabase.co")
    verifier = SupabaseTokenVerifier(config=config, jwks_client=_StubJwkClient(public_jwk))
    app = create_app(auth_config=config, token_verifier=verifier)

    good_token = jwt.encode(
        _make_claims(),
        private_key,
        algorithm="ES256",
        headers={"kid": "kid-es256-1"},
    )
    ok_res = _request(app, "GET", "/api/v1/auth/me", headers={"Authorization": f"Bearer {good_token}"})
    assert ok_res.status_code == 200
    assert ok_res.json() == {
        "user_id": "student-123",
        "email": "student@hcmus.edu.vn",
        "role": "authenticated",
        "auth_mode": "supabase_jwt",
    }

    wrong_aud = jwt.encode(
        _make_claims(aud="wrong-aud"),
        private_key,
        algorithm="ES256",
        headers={"kid": "kid-es256-1"},
    )
    bad_aud_res = _request(app, "GET", "/api/v1/auth/me", headers={"Authorization": f"Bearer {wrong_aud}"})
    assert bad_aud_res.status_code == 401
    assert bad_aud_res.json()["error"]["code"] == "AUTH_INVALID_TOKEN"

    wrong_iss = jwt.encode(
        _make_claims(iss="https://evil.example/auth/v1"),
        private_key,
        algorithm="ES256",
        headers={"kid": "kid-es256-1"},
    )
    bad_iss_res = _request(app, "GET", "/v1/auth/me", headers={"Authorization": f"Bearer {wrong_iss}"})
    assert bad_iss_res.status_code == 401
    assert bad_iss_res.json()["error"]["code"] == "AUTH_INVALID_TOKEN"

    missing_sub = jwt.encode(
        _make_claims(sub=None),
        private_key,
        algorithm="ES256",
        headers={"kid": "kid-es256-1"},
    )
    no_sub_res = _request(app, "GET", "/api/v1/auth/me", headers={"Authorization": f"Bearer {missing_sub}"})
    assert no_sub_res.status_code == 401
    assert no_sub_res.json()["error"]["code"] == "AUTH_INVALID_TOKEN"


def test_accepts_hs256_fallback_and_distinguishes_expired_token():
    secret = "test-hmac-secret-at-least-32-bytes-long"
    config = AuthConfig(supabase_url="https://proj.supabase.co", jwt_secret=secret)
    app = create_app(auth_config=config)

    valid_hs = jwt.encode(_make_claims(sub="student-hs"), secret, algorithm="HS256")
    res = _request(app, "GET", "/api/v1/auth/me", headers={"Authorization": f"Bearer {valid_hs}"})
    assert res.status_code == 200
    assert res.json()["user_id"] == "student-hs"
    assert res.json()["auth_mode"] == "supabase_jwt"

    expired_hs = jwt.encode(_make_claims(delta_seconds=-60), secret, algorithm="HS256")
    exp_res = _request(app, "GET", "/api/v1/auth/me", headers={"Authorization": f"Bearer {expired_hs}"})
    assert exp_res.status_code == 401
    assert exp_res.json()["error"]["code"] == "AUTH_TOKEN_EXPIRED"

    bad_sig_hs = jwt.encode(_make_claims(), "different-wrong-secret-at-least-32b", algorithm="HS256")
    sig_res = _request(app, "GET", "/api/v1/auth/me", headers={"Authorization": f"Bearer {bad_sig_hs}"})
    assert sig_res.status_code == 401
    assert sig_res.json()["error"]["code"] == "AUTH_INVALID_TOKEN"

    non_bearer = _request(app, "GET", "/api/v1/auth/me", headers={"Authorization": "Basic abcdef"})
    assert non_bearer.status_code == 401
    assert non_bearer.json()["error"]["code"] == "AUTH_REQUIRED"


def test_local_dev_auth_opt_in_and_supabase_guardrail():
    dev_config = load_auth_config({"CARENTA_LOCAL_DEV_AUTH": "true", "CARENTA_LOCAL_DEV_USER_ID": "dev-student"})
    assert dev_config.local_dev_auth is True

    dev_app = create_app(auth_config=dev_config)
    ok_res = _request(dev_app, "GET", "/api/v1/auth/me")
    assert ok_res.status_code == 200
    assert ok_res.json() == {
        "user_id": "dev-student",
        "email": None,
        "role": "authenticated",
        "auth_mode": "local_dev",
    }

    # Even in local_dev, an explicit malformed Bearer token must be rejected
    bad_explicit = _request(dev_app, "GET", "/api/v1/auth/me", headers={"Authorization": "Bearer invalid.jwt.here"})
    assert bad_explicit.status_code == 401
    assert bad_explicit.json()["error"]["code"] == "AUTH_INVALID_TOKEN"

    # Guardrail: local dev opt-in MUST be ignored when Supabase config is present
    guarded_config = load_auth_config({
        "CARENTA_LOCAL_DEV_AUTH": "true",
        "SUPABASE_URL": "https://proj.supabase.co",
    })
    assert guarded_config.local_dev_auth is False
    guarded_app = create_app(auth_config=guarded_config)
    denied = _request(guarded_app, "GET", "/api/v1/auth/me")
    assert denied.status_code == 401
    assert denied.json()["error"]["code"] == "AUTH_REQUIRED"


def test_unsafe_request_id_is_replaced_with_fresh_generated_id():
    app = create_app()
    res = _request(app, "GET", "/health", headers={"X-Request-ID": "bad id with spaces / <script>"})
    assert res.status_code == 200
    generated = res.headers["x-request-id"]
    assert generated != "bad id with spaces / <script>"
    assert len(generated) == 12


def test_jwks_connection_outage_returns_503_instead_of_401():
    class _OutageJwkClient:
        def get_signing_key_from_jwt(self, _token: str):
            raise jwt.PyJWKClientConnectionError("Connection refused")

    private_key, _ = _generate_es256_pair()
    token = jwt.encode(
        _make_claims(),
        private_key,
        algorithm="ES256",
        headers={"kid": "kid-es256-1"},
    )
    config = AuthConfig(supabase_url="https://proj.supabase.co")
    verifier = SupabaseTokenVerifier(config=config, jwks_client=_OutageJwkClient())
    app = create_app(auth_config=config, token_verifier=verifier)

    res = _request(app, "GET", "/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert res.status_code == 503
    assert res.json()["error"]["code"] == "AUTH_SERVICE_UNAVAILABLE"


class _ValidationItem(BaseModel):
    amount: int = Field(gt=0)


def test_validation_422_and_unhandled_500_use_safe_structured_envelopes():
    app = create_app()

    @app.post("/test-validate")
    def _validate(payload: _ValidationItem):
        return payload

    @app.get("/test-boom")
    def _boom():
        raise RuntimeError("secret-db-password-must-not-leak")

    async def run_cases():
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            bad_res = await client.post("/test-validate", json={"amount": -5})
            boom_res = await client.get("/test-boom", headers={"X-Request-ID": "req-500"})
            return bad_res, boom_res

    bad_res, boom_res = asyncio.run(run_cases())
    assert bad_res.status_code == 422
    assert bad_res.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "amount" in bad_res.json()["error"]["message"]
    assert "-5" not in bad_res.json()["error"]["message"]

    assert boom_res.status_code == 500
    assert boom_res.json() == {
        "error": {
            "code": "INTERNAL_ERROR",
            "message": "An unexpected server error occurred.",
            "request_id": "req-500",
        }
    }
    assert "secret-db-password" not in boom_res.text
