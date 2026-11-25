import asyncio

import httpx

from app.main import app, create_app


def get(path, application=app):
    async def request():
        transport = httpx.ASGITransport(app=application)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.get(path)

    return asyncio.run(request())


def test_health_returns_service_identity():
    response = get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "carenta-api"}


def test_openapi_describes_health():
    schema = get("/openapi.json", create_app()).json()
    assert "/health" in schema["paths"]
    response_schema = schema["paths"]["/health"]["get"]["responses"]["200"]
    assert response_schema["content"]["application/json"]["schema"]["$ref"].endswith(
        "/HealthResponse"
    )
