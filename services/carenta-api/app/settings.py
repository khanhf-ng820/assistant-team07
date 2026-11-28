"""Server-side Supabase configuration.

Secrets are read from the backend process environment only (for example
``services/carenta-api/.env`` loaded with ``uv run --env-file``). They are
wrapped in ``SecretStr`` so they never appear in ``repr``, logs or responses.
The service-role key bypasses row-level security; it must never be copied into
``apps/mobile`` or any ``EXPO_PUBLIC_*`` variable.
"""

import datetime as dt
import os
from collections.abc import Mapping
from dataclasses import dataclass

from pydantic import SecretStr

_REQUIRED = ("SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY")
_TRUTHY = frozenset({"1", "true", "yes", "on"})


@dataclass(frozen=True)
class SupabaseSettings:
    url: str
    anon_key: SecretStr
    service_role_key: SecretStr


@dataclass(frozen=True)
class SchedulerSettings:
    """Configuration for the in-process background scheduler and cron endpoints."""

    enabled: bool = False
    poll_interval_seconds: float = 60.0
    evening_reminder_time: dt.time = dt.time(20, 0)
    habit_analysis_time: dt.time = dt.time(7, 30)
    scheduler_secret: SecretStr | None = None


def _parse_hhmm(raw: str, var_name: str, default: dt.time) -> dt.time:
    cleaned = raw.strip()
    if not cleaned:
        return default
    parts = cleaned.split(":")
    if len(parts) != 2 or not all(p.isdigit() for p in parts):
        raise ValueError(f"{var_name} must use HH:MM 24-hour format.")
    hour, minute = int(parts[0]), int(parts[1])
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise ValueError(f"{var_name} has an out-of-range hour or minute.")
    return dt.time(hour, minute)


def load_scheduler_settings(
    environ: Mapping[str, str] | None = None,
) -> SchedulerSettings:
    """Load in-process scheduler settings from environment variables."""
    env = os.environ if environ is None else environ
    enabled = env.get("CARENTA_SCHEDULER_ENABLED", "").strip().lower() in _TRUTHY

    raw_poll = env.get("CARENTA_SCHEDULER_POLL_SECONDS", "").strip()
    if raw_poll:
        try:
            poll_interval_seconds = float(raw_poll)
        except ValueError as exc:
            raise ValueError("CARENTA_SCHEDULER_POLL_SECONDS must be a positive number.") from exc
        if poll_interval_seconds <= 0:
            raise ValueError("CARENTA_SCHEDULER_POLL_SECONDS must be greater than zero.")
    else:
        poll_interval_seconds = 60.0

    evening_reminder_time = _parse_hhmm(
        env.get("CARENTA_EVENING_REMINDER_TIME", ""),
        "CARENTA_EVENING_REMINDER_TIME",
        dt.time(20, 0),
    )
    habit_analysis_time = _parse_hhmm(
        env.get("CARENTA_HABIT_ANALYSIS_TIME", ""),
        "CARENTA_HABIT_ANALYSIS_TIME",
        dt.time(7, 30),
    )

    raw_secret = env.get("CARENTA_SCHEDULER_SECRET", "").strip()
    scheduler_secret = SecretStr(raw_secret) if raw_secret else None

    return SchedulerSettings(
        enabled=enabled,
        poll_interval_seconds=poll_interval_seconds,
        evening_reminder_time=evening_reminder_time,
        habit_analysis_time=habit_analysis_time,
        scheduler_secret=scheduler_secret,
    )


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
