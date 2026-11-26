from app.main import create_app


def test_health_returns_service_identity(request_api):
    response = request_api("GET", "/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "carenta-api"}
    assert "x-request-id" in response.headers
    assert len(response.headers["x-request-id"]) >= 8


def test_health_echoes_safe_incoming_request_id(request_api):
    response = request_api("GET", "/health", headers={"X-Request-ID": "req-mobile-123"})
    assert response.status_code == 200
    assert response.headers["x-request-id"] == "req-mobile-123"


def test_openapi_describes_expected_routes(request_api):
    schema = request_api("GET", "/openapi.json", application=create_app()).json()
    expected_routes = {
        "/health",
        "/api/v1/auth/me",
        "/v1/auth/me",
        "/api/v1/transactions",
        "/api/v1/budget/summary",
        "/api/v1/goal",
    }
    assert expected_routes.issubset(set(schema["paths"]))
    response_schema = schema["paths"]["/health"]["get"]["responses"]["200"]
    assert response_schema["content"]["application/json"]["schema"]["$ref"].endswith(
        "/HealthResponse"
    )


def test_unknown_route_uses_structured_error_envelope(request_api):
    response = request_api("GET", "/v1/nonexistent-route", headers={"X-Request-ID": "req-404-check"})
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "NOT_FOUND"
    assert isinstance(body["error"]["message"], str) and body["error"]["message"]
    assert body["error"]["request_id"] == "req-404-check"
    assert response.headers["x-request-id"] == "req-404-check"
