import re

import httpx
import pytest
from fastapi.testclient import TestClient

from assistant_api.main import create_app
from assistant_api.weather import WeatherClient
from assistant_core.responder import StubLLMResponder

OK_JSON = {"current": {"time": "2026-10-05T09:00", "temperature_2m": 31.2, "weather_code": 3, "wind_speed_10m": 8.5}}


def weather_with(handler) -> WeatherClient:
    transport = httpx.MockTransport(handler)
    return WeatherClient("https://example.test/forecast", 10.76, 106.68, retries=1, transport=transport)


@pytest.fixture
def client(settings, service):
    settings = settings.model_copy(update={"api_admin_key": "secret-admin", "rate_limit_per_min": 5})
    app = create_app(settings, service, weather_with(lambda req: httpx.Response(200, json=OK_JSON)))
    return TestClient(app)


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_chat_fee(client):
    r = client.post("/v1/chat", json={"message": "tuition for 18 credits and 2 retake"})
    assert r.status_code == 200
    body = r.json()
    assert body["intent"] == "fee" and "9,450,000" in body["answer"] and body["request_id"]


def test_chat_validation_error(client):
    r = client.post("/v1/chat", json={"message": ""})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_request"


def test_chat_request_ids_are_distinct_hex(client):
    responses = [client.post("/v1/chat", json={"message": "hi"}) for _ in range(2)]
    assert all(response.status_code == 200 for response in responses)
    ids = [response.json()["request_id"] for response in responses]
    assert all(re.fullmatch(r"[0-9a-f]{12}", request_id) for request_id in ids)
    assert ids[0] != ids[1]


def test_chat_preserves_sources_and_degraded(client, service):
    question = "can I register my thesis with 118 credits"
    for fail in (False, True):
        service.responder = StubLLMResponder(fail=fail)
        response = client.post("/v1/chat", json={"message": question})
        assert response.status_code == 200
        body = response.json()
        assert body["intent"] == "rule"
        assert body["sources"] == [{"id": "H26-5.3", "title": "Thesis registration"}]
        assert body["degraded"] is fail
        assert body["answer"]


def test_chat_forwards_session_id(client, service, monkeypatch):
    messages = []
    original_handle = service.handle

    def record_message(message):
        messages.append(message)
        return original_handle(message)

    monkeypatch.setattr(service, "handle", record_message)
    response = client.post("/v1/chat", json={"message": "hi", "session_id": "personal-demo"})
    assert response.status_code == 200
    assert len(messages) == 1
    assert messages[0].text == "hi"
    assert messages[0].session_id == "personal-demo"


@pytest.mark.skip(reason="BONUS task — remove this line when you add rate limiting")
def test_rate_limit(client):
    codes = [client.post("/v1/chat", json={"message": "hi"}).status_code for _ in range(6)]
    assert codes[-1] == 429


def test_feedback_roundtrip(client):
    r = client.post("/v1/feedback", json={"request_id": "abc123", "rating": 1})
    assert r.status_code == 201 and r.json()["id"] == 1
    assert client.get("/v1/feedback").status_code == 401
    assert client.get("/v1/feedback", headers={"X-API-Key": "wrong-key"}).status_code == 401
    listed = client.get("/v1/feedback", headers={"X-API-Key": "secret-admin"})
    assert listed.status_code == 200 and len(listed.json()) == 1


def test_feedback_rating_out_of_range(client):
    assert client.post("/v1/feedback", json={"request_id": "x", "rating": 5}).status_code == 422


def test_weather_ok(client):
    r = client.get("/v1/weather")
    assert r.status_code == 200 and r.json()["description"] == "overcast"


def test_weather_down_returns_503(settings, service):
    def boom(req):
        raise httpx.ConnectTimeout("timeout", request=req)

    app = create_app(settings, service, weather_with(boom))
    r = TestClient(app).get("/v1/weather")
    assert r.status_code == 503 and r.json()["error"]["code"] == "weather_service_unavailable"


def test_weather_stale_cache_when_upstream_fails():
    calls = {"n": 0}

    def flaky(req):
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(200, json=OK_JSON)
        return httpx.Response(500)

    w = weather_with(flaky)
    w.cache_ttl_s = 0  # force a refresh on the second call
    assert not w.current().stale
    assert w.current().stale
