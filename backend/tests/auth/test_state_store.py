"""Unit tests for InMemoryStateStore.

Covers:
- Store and retrieve success (Req 8.2)
- One-time-use: second call returns None (Req 8.3)
- Unknown state returns None (Req 8.4)
- TTL expiration (Req 8.5)
- cleanup_expired removes only expired entries (Req 8.6)
"""

from unittest.mock import patch

from apis.shared.auth.state_store import InMemoryStateStore, OIDCStateData


class TestStoreAndRetrieveSuccess:
    """Req 8.2: store_state then get_and_delete_state returns (True, data)."""

    def test_round_trip_with_full_data(self):
        store = InMemoryStateStore()
        data = OIDCStateData(
            redirect_uri="https://example.com/callback",
            code_verifier="test-verifier-abc123",
            nonce="nonce-xyz",
            provider_id="my-provider",
        )
        store.store_state("state-1", data=data, ttl_seconds=600)

        valid, retrieved = store.get_and_delete_state("state-1")

        assert valid is True
        assert retrieved is not None
        assert retrieved.redirect_uri == "https://example.com/callback"
        assert retrieved.code_verifier == "test-verifier-abc123"
        assert retrieved.nonce == "nonce-xyz"
        assert retrieved.provider_id == "my-provider"

    def test_round_trip_with_none_data(self):
        store = InMemoryStateStore()
        store.store_state("state-2", data=None, ttl_seconds=600)

        valid, retrieved = store.get_and_delete_state("state-2")

        assert valid is True
        assert retrieved is None

    def test_round_trip_with_partial_data(self):
        store = InMemoryStateStore()
        data = OIDCStateData(redirect_uri="https://example.com/cb")
        store.store_state("state-3", data=data, ttl_seconds=300)

        valid, retrieved = store.get_and_delete_state("state-3")

        assert valid is True
        assert retrieved is not None
        assert retrieved.redirect_uri == "https://example.com/cb"
        assert retrieved.code_verifier is None
        assert retrieved.nonce is None
        assert retrieved.provider_id is None


class TestOneTimeUse:
    """Req 8.3: second get_and_delete_state returns (False, None)."""

    def test_second_call_returns_none(self):
        store = InMemoryStateStore()
        data = OIDCStateData(provider_id="p1")
        store.store_state("state-once", data=data, ttl_seconds=600)

        first_valid, first_data = store.get_and_delete_state("state-once")
        assert first_valid is True
        assert first_data is not None

        second_valid, second_data = store.get_and_delete_state("state-once")
        assert second_valid is False
        assert second_data is None


class TestUnknownState:
    """Req 8.4: unknown state returns (False, None)."""

    def test_never_stored_state(self):
        store = InMemoryStateStore()

        valid, data = store.get_and_delete_state("never-stored")

        assert valid is False
        assert data is None

    def test_empty_store(self):
        store = InMemoryStateStore()

        valid, data = store.get_and_delete_state("")

        assert valid is False
        assert data is None


class TestTTLExpiration:
    """Req 8.5: expired state returns (False, None)."""

    def test_expired_state_returns_false(self):
        store = InMemoryStateStore()
        data = OIDCStateData(provider_id="p1")
        store.store_state("state-ttl", data=data, ttl_seconds=10)

        # Simulate time advancing past TTL
        future_time = store._store["state-ttl"][0] + 1
        with patch("apis.shared.auth.state_store.time") as mock_time:
            mock_time.time.return_value = future_time
            valid, retrieved = store.get_and_delete_state("state-ttl")

        assert valid is False
        assert retrieved is None

    def test_zero_ttl_expires_immediately(self):
        """A TTL of 0 means the state expires at the moment of storage."""
        store = InMemoryStateStore()
        data = OIDCStateData(nonce="n1")

        # Store with ttl=0, then advance time slightly
        with patch("apis.shared.auth.state_store.time") as mock_time:
            # store_state: time.time() returns T, so expires_at = T + 0 = T
            mock_time.time.return_value = 1000.0
            store.store_state("state-zero", data=data, ttl_seconds=0)

            # get_and_delete_state: time.time() returns T+1, which > T
            mock_time.time.return_value = 1001.0
            valid, retrieved = store.get_and_delete_state("state-zero")

        assert valid is False
        assert retrieved is None


class TestCleanupExpired:
    """Req 8.6: _cleanup_expired removes only expired entries."""

    def test_cleanup_removes_only_expired(self):
        store = InMemoryStateStore()

        # Store two states: one with short TTL, one with long TTL
        with patch("apis.shared.auth.state_store.time") as mock_time:
            mock_time.time.return_value = 1000.0
            store.store_state("short-lived", data=OIDCStateData(nonce="s"), ttl_seconds=10)
            store.store_state("long-lived", data=OIDCStateData(nonce="l"), ttl_seconds=3600)

        assert len(store._store) == 2

        # Advance time past the short TTL but not the long one
        with patch("apis.shared.auth.state_store.time") as mock_time:
            mock_time.time.return_value = 1015.0  # 15s later: short expired, long still valid
            store._cleanup_expired()

        assert "short-lived" not in store._store
        assert "long-lived" in store._store

    def test_cleanup_preserves_all_when_none_expired(self):
        store = InMemoryStateStore()

        with patch("apis.shared.auth.state_store.time") as mock_time:
            mock_time.time.return_value = 1000.0
            store.store_state("a", data=None, ttl_seconds=600)
            store.store_state("b", data=None, ttl_seconds=600)

            # Cleanup immediately — nothing should be expired
            store._cleanup_expired()

        assert len(store._store) == 2

    def test_cleanup_triggered_on_store(self):
        """store_state calls _cleanup_expired, removing stale entries."""
        store = InMemoryStateStore()

        with patch("apis.shared.auth.state_store.time") as mock_time:
            mock_time.time.return_value = 1000.0
            store.store_state("old", data=None, ttl_seconds=5)

            # Advance time past old's TTL, then store a new one
            mock_time.time.return_value = 1010.0
            store.store_state("new", data=None, ttl_seconds=600)

        # "old" should have been cleaned up when "new" was stored
        assert "old" not in store._store
        assert "new" in store._store
