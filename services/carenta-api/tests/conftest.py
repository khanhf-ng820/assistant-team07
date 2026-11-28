import asyncio
import datetime as dt
from dataclasses import dataclass

import httpx
import jwt
import pytest

from app.auth import AuthConfig
from app.main import app

TEST_JWT_SECRET = "test-hmac-secret-at-least-32-bytes-long"
TEST_JWT_ISSUER = "https://proj.supabase.co/auth/v1"


@dataclass
class MutableClock:
    current_utc: dt.datetime

    def __call__(self) -> dt.datetime:
        return self.current_utc


def make_hs256_token(
    sub: str = "student-a",
    *,
    secret: str = TEST_JWT_SECRET,
    issuer: str = TEST_JWT_ISSUER,
) -> str:
    now = dt.datetime.now(dt.timezone.utc)
    return jwt.encode(
        {
            "sub": sub,
            "email": f"{sub}@hcmus.edu.vn",
            "role": "authenticated",
            "aud": "authenticated",
            "iss": issuer,
            "iat": int(now.timestamp()),
            "exp": int((now + dt.timedelta(hours=1)).timestamp()),
        },
        secret,
        algorithm="HS256",
    )


def strict_auth_config(secret: str = TEST_JWT_SECRET) -> AuthConfig:
    return AuthConfig(
        supabase_url="https://proj.supabase.co",
        jwt_secret=secret,
        local_dev_auth=False,
    )


def asgi_request(
    application,
    method: str,
    path: str,
    *,
    json: dict | None = None,
    headers: dict[str, str] | None = None,
):
    async def run():
        transport = httpx.ASGITransport(app=application)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.request(method, path, json=json, headers=headers)

    return asyncio.run(run())


@pytest.fixture
def request_api():
    def request(method, path, *, application=app, **kwargs):
        async def send():
            transport = httpx.ASGITransport(app=application)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                return await client.request(method, path, **kwargs)

        return asyncio.run(send())

    return request
