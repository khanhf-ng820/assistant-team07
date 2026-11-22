from app.main import create_app


def test_health_returns_service_identity(request_api):
    response = request_api("GET", "/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "carenta-api"}


def test_openapi_describes_health(request_api):
    schema = request_api("GET", "/openapi.json", application=create_app()).json()
    assert "/health" in schema["paths"]
    response_schema = schema["paths"]["/health"]["get"]["responses"]["200"]
    assert response_schema["content"]["application/json"]["schema"]["$ref"].endswith(
        "/HealthResponse"
    )
