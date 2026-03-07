"""Tests for health check endpoints.

App API:  GET /health  → 200 with status, service, version
Inference API: GET /ping → 200

Requirements: 2.1, 2.2, 2.3
"""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from apis.app_api.health import router as app_health_router
from apis.inference_api.chat.routes import router as inference_router


# ---------------------------------------------------------------------------
# App API health
# ---------------------------------------------------------------------------


@pytest.fixture
def app_health_app():
    """Minimal FastAPI app mounting only the App API health router."""
    _app = FastAPI()
    _app.include_router(app_health_router)
    return _app


@pytest.fixture
def app_health_client(app_health_app):
    return TestClient(app_health_app)


class TestAppApiHealth:
    """Requirement 2.1, 2.2: GET /health returns 200 with expected fields."""

    def test_health_returns_200(self, app_health_client):
        resp = app_health_client.get("/health")
        assert resp.status_code == 200

    def test_health_response_contains_required_fields(self, app_health_client):
        body = app_health_client.get("/health").json()
        assert "status" in body
        assert "service" in body
        assert "version" in body

    def test_health_status_is_healthy(self, app_health_client):
        body = app_health_client.get("/health").json()
        assert body["status"] == "healthy"


# ---------------------------------------------------------------------------
# Inference API ping
# ---------------------------------------------------------------------------


@pytest.fixture
def inference_app():
    """Minimal FastAPI app mounting only the Inference API agentcore router."""
    _app = FastAPI()
    _app.include_router(inference_router)
    return _app


@pytest.fixture
def inference_client(inference_app):
    return TestClient(inference_app)


class TestInferenceApiPing:
    """Requirement 2.3: GET /ping returns 200."""

    def test_ping_returns_200(self, inference_client):
        resp = inference_client.get("/ping")
        assert resp.status_code == 200
