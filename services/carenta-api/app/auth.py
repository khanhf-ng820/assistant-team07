"""Server-side Supabase JWT verification and Student Identity extraction."""

from __future__ import annotations

import os
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Literal, Protocol

import jwt
from fastapi import Header
from pydantic import BaseModel

from app.errors import ApiHttpError

_ASYMMETRIC_ALGS = frozenset({"ES256", "RS256", "ES384", "RS384"})


class AuthIdentity(BaseModel):
    """Verified owner identity derived from a Bearer JWT or explicit local-dev mode."""

    user_id: str
    email: str | None = None
    role: str = "authenticated"
    auth_mode: Literal["supabase_jwt", "local_dev"] = "supabase_jwt"


@dataclass(frozen=True)
class AuthConfig:
    supabase_url: str | None = None
    jwt_secret: str | None = None
    audience: str = "authenticated"
    local_dev_auth: bool = False
    local_dev_user_id: str = "00000000-0000-0000-0000-000000000001"


class JwkProvider(Protocol):
    def get_signing_key_from_jwt(self, token: str): ...


class TokenVerifier(Protocol):
    def verify(self, token: str) -> AuthIdentity: ...


def load_auth_config(environ: Mapping[str, str] | None = None) -> AuthConfig:
    """Load auth configuration from env vars, guarding against unsafe local-dev bypass."""
    env = os.environ if environ is None else environ
    supabase_url = env.get("SUPABASE_URL", "").strip() or None
    jwt_secret = env.get("SUPABASE_JWT_SECRET", "").strip() or None
    audience = env.get("SUPABASE_JWT_AUDIENCE", "").strip() or "authenticated"
    raw_dev_flag = env.get("CARENTA_LOCAL_DEV_AUTH", "").strip().lower()
    dev_user_id = (
        env.get("CARENTA_LOCAL_DEV_USER_ID", "").strip()
        or "00000000-0000-0000-0000-000000000001"
    )

    has_supabase_config = bool(supabase_url or jwt_secret)
    local_dev_auth = (not has_supabase_config) and raw_dev_flag in {"1", "true", "yes"}

    return AuthConfig(
        supabase_url=supabase_url,
        jwt_secret=jwt_secret,
        audience=audience,
        local_dev_auth=local_dev_auth,
        local_dev_user_id=dev_user_id,
    )


class SupabaseTokenVerifier:
    """Verify Supabase access tokens via JWKS (primary) or HS256 secret (fallback)."""

    def __init__(
        self,
        config: AuthConfig,
        jwks_client: JwkProvider | None = None,
    ) -> None:
        self._config = config
        self._jwks_client = jwks_client

    def _issuer(self) -> str | None:
        if not self._config.supabase_url:
            return None
        return f"{self._config.supabase_url.rstrip('/')}/auth/v1"

    def _get_jwks_client(self) -> JwkProvider:
        if self._jwks_client is not None:
            return self._jwks_client
        issuer = self._issuer()
        if not issuer:
            raise ApiHttpError(
                401, "AUTH_INVALID_TOKEN", "Supabase JWKS issuer is not configured."
            )
        self._jwks_client = jwt.PyJWKClient(f"{issuer}/.well-known/jwks.json")
        return self._jwks_client

    def _decode_claims(self, token: str) -> dict[str, object]:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as exc:
            raise ApiHttpError(401, "AUTH_INVALID_TOKEN", "Invalid authentication token.") from exc

        alg = header.get("alg")
        if not isinstance(alg, str) or alg.lower() == "none":
            raise ApiHttpError(401, "AUTH_INVALID_TOKEN", "Invalid authentication token.")

        issuer = self._issuer()
        decode_kwargs: dict[str, object] = {
            "audience": self._config.audience,
            "options": {"require": ["exp", "sub"]},
        }
        if issuer:
            decode_kwargs["issuer"] = issuer

        if alg in _ASYMMETRIC_ALGS and issuer:
            try:
                signing_key = self._get_jwks_client().get_signing_key_from_jwt(token).key
            except jwt.PyJWKClientConnectionError as exc:
                raise ApiHttpError(
                    503,
                    "AUTH_SERVICE_UNAVAILABLE",
                    "Authentication service temporarily unavailable.",
                ) from exc
            except jwt.PyJWKClientError as exc:
                raise ApiHttpError(
                    401, "AUTH_INVALID_TOKEN", "Invalid authentication token."
                ) from exc
            return jwt.decode(token, signing_key, algorithms=[alg], **decode_kwargs)

        if alg == "HS256" and self._config.jwt_secret:
            return jwt.decode(
                token, self._config.jwt_secret, algorithms=["HS256"], **decode_kwargs
            )

        raise ApiHttpError(401, "AUTH_INVALID_TOKEN", "Invalid authentication token.")

    def verify(self, token: str) -> AuthIdentity:
        try:
            claims = self._decode_claims(token)
        except ApiHttpError:
            raise
        except jwt.ExpiredSignatureError as exc:
            raise ApiHttpError(401, "AUTH_TOKEN_EXPIRED", "Session token expired.") from exc
        except jwt.PyJWTError as exc:
            raise ApiHttpError(
                401, "AUTH_INVALID_TOKEN", "Invalid authentication token."
            ) from exc

        subject = claims.get("sub")
        if not isinstance(subject, str) or not subject.strip():
            raise ApiHttpError(401, "AUTH_INVALID_TOKEN", "Invalid authentication token.")

        email = claims.get("email")
        role = claims.get("role")
        return AuthIdentity(
            user_id=subject.strip(),
            email=email if isinstance(email, str) and email else None,
            role=role if isinstance(role, str) and role else "authenticated",
            auth_mode="supabase_jwt",
        )


def make_current_identity_dependency(
    config: AuthConfig,
    verifier: TokenVerifier | None = None,
) -> Callable[..., AuthIdentity]:
    """Create the FastAPI dependency that resolves verified Student Identity."""
    active_verifier = verifier or SupabaseTokenVerifier(config=config)

    def get_current_identity(
        authorization: str | None = Header(default=None),
    ) -> AuthIdentity:
        if authorization is None:
            if config.local_dev_auth:
                return AuthIdentity(
                    user_id=config.local_dev_user_id,
                    email=None,
                    role="authenticated",
                    auth_mode="local_dev",
                )
            raise ApiHttpError(401, "AUTH_REQUIRED", "Authentication required.")

        scheme, _, raw_token = authorization.strip().partition(" ")
        token = raw_token.strip()
        if scheme.lower() != "bearer" or not token:
            raise ApiHttpError(401, "AUTH_REQUIRED", "Authentication required.")

        return active_verifier.verify(token)

    return get_current_identity
