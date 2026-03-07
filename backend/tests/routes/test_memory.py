"""Tests for memory routes.

Endpoints under test:
- GET /memory          → 200 with all memories (authenticated)
- GET /memory/status   → 200 with memory status (authenticated)
- GET /memory/preferences → 200 with preferences (authenticated)
- GET /memory/facts    → 200 with facts (authenticated)
- GET /memory          → 401 for unauthenticated request
- All endpoints        → 401 for unauthenticated request

Requirements: 9.1, 9.2
"""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from apis.app_api.memory.routes import router
from tests.routes.conftest import mock_auth_user, mock_no_auth

ROUTES_MODULE = "apis.app_api.memory.routes"

SAMPLE_MEMORY = {
    "record_id": "mem-001",
    "content": "User prefers concise responses",
    "relevance_score": 0.95,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z",
    "metadata": {},
}

SAMPLE_CONFIG_INFO = {
    "available": True,
    "memory_id": "mem-instance-001",
    "mode": "cloud",
}


@pytest.fixture
def app():
    """Minimal FastAPI app mounting only the memory router."""
    _app = FastAPI()
    _app.include_router(router)
    return _app


# ---------------------------------------------------------------------------
# Requirement 9.1: Memory endpoint returns 200 with memory data
# ---------------------------------------------------------------------------


class TestGetAllMemoriesAuthenticated:
    """GET /memory returns 200 with all memories for authenticated user."""

    def test_returns_200_with_memories(self, app, make_user):
        """Req 9.1: Authenticated user gets 200 with memory data."""
        user = make_user()
        mock_auth_user(app, user)

        mock_all_memories = AsyncMock(
            return_value={
                "preferences": [SAMPLE_MEMORY],
                "facts": [SAMPLE_MEMORY],
            }
        )

        with patch(f"{ROUTES_MODULE}.is_memory_available", return_value=True), \
             patch(f"{ROUTES_MODULE}.get_all_user_memories", mock_all_memories):
            client = TestClient(app)
            resp = client.get("/memory")

        assert resp.status_code == 200
        body = resp.json()
        assert "preferences" in body
        assert "facts" in body
        assert len(body["preferences"]["memories"]) == 1
        assert len(body["facts"]["memories"]) == 1


class TestGetMemoryStatusAuthenticated:
    """GET /memory/status returns 200 with status info."""

    def test_returns_200_with_status(self, app, make_user):
        """Req 9.1: Authenticated user gets 200 with memory status."""
        user = make_user()
        mock_auth_user(app, user)

        with patch(f"{ROUTES_MODULE}.get_memory_config_info", return_value=SAMPLE_CONFIG_INFO):
            client = TestClient(app)
            resp = client.get("/memory/status")

        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "available"


class TestGetPreferencesAuthenticated:
    """GET /memory/preferences returns 200 with preferences."""

    def test_returns_200_with_preferences(self, app, make_user):
        """Req 9.1: Authenticated user gets 200 with preferences."""
        user = make_user()
        mock_auth_user(app, user)

        with patch(f"{ROUTES_MODULE}.is_memory_available", return_value=True), \
             patch(f"{ROUTES_MODULE}.get_user_preferences", AsyncMock(return_value=[SAMPLE_MEMORY])):
            client = TestClient(app)
            resp = client.get("/memory/preferences")

        assert resp.status_code == 200
        body = resp.json()
        assert "memories" in body
        assert body["totalCount"] == 1


# ---------------------------------------------------------------------------
# Requirement 9.2: Memory endpoint returns 401 for unauthenticated request
# ---------------------------------------------------------------------------


class TestMemoryUnauthenticated:
    """All memory endpoints return 401 for unauthenticated requests."""

    def test_get_all_returns_401(self, app, unauthenticated_client):
        """Req 9.2: GET /memory returns 401 unauthenticated."""
        client = unauthenticated_client(app)
        assert client.get("/memory").status_code == 401

    def test_get_status_returns_401(self, app, unauthenticated_client):
        """Req 9.2: GET /memory/status returns 401 unauthenticated."""
        client = unauthenticated_client(app)
        assert client.get("/memory/status").status_code == 401

    def test_get_preferences_returns_401(self, app, unauthenticated_client):
        """Req 9.2: GET /memory/preferences returns 401 unauthenticated."""
        client = unauthenticated_client(app)
        assert client.get("/memory/preferences").status_code == 401

    def test_get_facts_returns_401(self, app, unauthenticated_client):
        """Req 9.2: GET /memory/facts returns 401 unauthenticated."""
        client = unauthenticated_client(app)
        assert client.get("/memory/facts").status_code == 401

    def test_search_returns_401(self, app, unauthenticated_client):
        """Req 9.2: POST /memory/search returns 401 unauthenticated."""
        client = unauthenticated_client(app)
        assert client.post("/memory/search", json={"query": "test"}).status_code == 401

    def test_delete_returns_401(self, app, unauthenticated_client):
        """Req 9.2: DELETE /memory/{record_id} returns 401 unauthenticated."""
        client = unauthenticated_client(app)
        assert client.delete("/memory/mem-001").status_code == 401
