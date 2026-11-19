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


@dataclass(frozen=True)
class SupabaseSettings:
    url: str
    anon_key: SecretStr
    service_role_key: SecretStr


def load_supabase_settings(environ: Mapping[str, str] | None = None) -> SupabaseSettings | None:
    """Return Supabase settings, or ``None`` when Supabase is not configured.

    A partial configuration is rejected so a missing key is noticed at start-up
    rather than on the first database request. Error messages name variables,
    never their values.
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
