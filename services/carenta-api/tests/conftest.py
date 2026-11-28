import asyncio

import httpx
import pytest

from app.main import app


@pytest.fixture
def request_api():
    def request(method, path, *, application=app, **kwargs):
        async def send():
            transport = httpx.ASGITransport(app=application)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                return await client.request(method, path, **kwargs)

        return asyncio.run(send())

    return request
