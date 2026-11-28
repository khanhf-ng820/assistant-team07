"""Server-side Supabase configuration.

Secrets are read from the backend process environment only (for example
``services/carenta-api/.env`` loaded with ``uv run --env-file``). They are
wrapped in ``SecretStr`` so they never appear in ``repr``, logs or responses.
The service-role key bypasses row-level security; it must never be copied into
``apps/mobile`` or any ``EXPO_PUBLIC_*`` variable.
"""

import os
from collections.abc import Mapping
from dataclasses import dataclass

from pydantic import SecretStr

_REQUIRED = ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY")
DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite"
DEFAULT_GEMINI_TIMEOUT_MS = 20_000


@dataclass(frozen=True)
class SupabaseSettings:
    url: str
    anon_key: SecretStr
    service_role_key: SecretStr


@dataclass(frozen=True)
class GeminiSettings:
    """Backend-only Gemini configuration with secret-wrapped API key."""

    api_key: SecretStr
    model: str = DEFAULT_GEMINI_MODEL
    timeout_ms: int = DEFAULT_GEMINI_TIMEOUT_MS


def load_supabase_settings(environ: Mapping[str, str] | None = None) -> SupabaseSettings | None:
    """Return full Supabase DB/admin settings, or ``None`` when unconfigured.

    This loader is strictly for future server-side Supabase DB/admin clients that
    require all three variables (``SUPABASE_URL``, ``SUPABASE_ANON_KEY``, and
    ``SUPABASE_SERVICE_ROLE_KEY``). FastAPI JWT-only authentication does not
    call this helper: ``app.auth.load_auth_config()`` verifies Bearer JWTs with
    ``SUPABASE_URL`` (or ``SUPABASE_JWT_SECRET``) alone.

    A partial configuration is rejected so a missing DB/admin key is noticed at
    start-up rather than on the first database request. Error messages name
    variables, never their values.
    """
    env = os.environ if environ is None else environ
    values = {name: env.get(name, "").strip() for name in _REQUIRED}
    if not any(values.values()):
        return None

    missing = [name for name, value in values.items() if not value]
    if missing:
        raise ValueError(f"Missing Supabase setting(s): {', '.join(missing)}")
    if not values["SUPABASE_URL"].startswith("https://"):
        raise ValueError("SUPABASE_URL must start with https://")

    return SupabaseSettings(
        url=values["SUPABASE_URL"],
        anon_key=SecretStr(values["SUPABASE_ANON_KEY"]),
        service_role_key=SecretStr(values["SUPABASE_SERVICE_ROLE_KEY"]),
    )


def load_gemini_settings(environ: Mapping[str, str] | None = None) -> GeminiSettings | None:
    """Return Gemini Voice Capture settings, or ``None`` when ``GEMINI_API_KEY`` is unset.

    ``GEMINI_API_KEY`` is wrapped in ``SecretStr`` and must never be copied into
    ``apps/mobile`` or any ``EXPO_PUBLIC_*`` variable.
    """
    env = os.environ if environ is None else environ
    api_key = env.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None

    if "CARENTA_GEMINI_MODEL" in env:
        model = env["CARENTA_GEMINI_MODEL"].strip()
        if not model:
            raise ValueError("CARENTA_GEMINI_MODEL must not be empty when GEMINI_API_KEY is set.")
    else:
        model = DEFAULT_GEMINI_MODEL

    return GeminiSettings(
        api_key=SecretStr(api_key),
        model=model,
        timeout_ms=DEFAULT_GEMINI_TIMEOUT_MS,
    )
