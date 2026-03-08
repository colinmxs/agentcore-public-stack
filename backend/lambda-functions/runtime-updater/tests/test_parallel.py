"""Tests for parallel runtime update execution (update_runtimes_parallel)."""

import sys
import os
from unittest.mock import patch, MagicMock

_tests_dir = os.path.dirname(__file__)
if _tests_dir not in sys.path:
    sys.path.insert(0, _tests_dir)

from conftest import make_provider_record, AUTH_PROVIDERS_TABLE


def _make_providers(n):
    """Return a list of n provider dicts."""
    return [
        {"provider_id": f"p{i}", "runtime_id": f"rt-{i}", "display_name": f"Provider {i}"}
        for i in range(1, n + 1)
    ]


def _seed_providers(lambda_module, providers):
    """Insert provider records into moto DynamoDB."""
    for p in providers:
        make_provider_record(
            lambda_module.dynamodb, p["provider_id"], runtime_id=p["runtime_id"]
        )


class TestUpdateRuntimesParallel:

    def test_single_provider_updated(self, lambda_module):
        providers = _make_providers(1)
        _seed_providers(lambda_module, providers)

        with patch("lambda_function.time.sleep"):
            results = lambda_module.update_runtimes_parallel(providers, "repo:v2.0.0")

        assert len(results) == 1
        assert results[0]["success"] is True
        assert results[0]["provider_id"] == "p1"

    def test_multiple_providers_all_succeed(self, lambda_module):
        providers = _make_providers(3)
        _seed_providers(lambda_module, providers)

        with patch("lambda_function.time.sleep"):
            results = lambda_module.update_runtimes_parallel(providers, "repo:v2.0.0")

        assert len(results) == 3
        assert all(r["success"] is True for r in results)
        returned_ids = {r["provider_id"] for r in results}
        assert returned_ids == {"p1", "p2", "p3"}

    def test_results_contain_all_providers(self, lambda_module):
        providers = _make_providers(5)
        _seed_providers(lambda_module, providers)

        with patch("lambda_function.time.sleep"):
            results = lambda_module.update_runtimes_parallel(providers, "repo:v2.0.0")

        assert len(results) == 5
        returned_ids = {r["provider_id"] for r in results}
        assert returned_ids == {f"p{i}" for i in range(1, 6)}

    def test_unexpected_exception_captured(self, lambda_module):
        """A non-ClientError raised inside the thread is captured with attempts=0."""
        providers = _make_providers(1)
        _seed_providers(lambda_module, providers)

        # Make update_runtime_with_retry raise a raw Exception that escapes the
        # retry loop entirely, so it is caught by the future.result() handler.
        with patch("lambda_function.time.sleep"), \
             patch.object(
                 lambda_module, "update_runtime_with_retry",
                 side_effect=RuntimeError("boom"),
             ):
            results = lambda_module.update_runtimes_parallel(providers, "repo:v2.0.0")

        assert len(results) == 1
        assert results[0]["success"] is False
        assert results[0]["attempts"] == 0
        assert "boom" in results[0]["error"]

    def test_max_workers_is_five(self, lambda_module):
        assert lambda_module.MAX_CONCURRENT_UPDATES == 5

    def test_many_providers_batched(self, lambda_module):
        providers = _make_providers(10)
        _seed_providers(lambda_module, providers)

        with patch("lambda_function.time.sleep"):
            results = lambda_module.update_runtimes_parallel(providers, "repo:v2.0.0")

        assert len(results) == 10
        returned_ids = {r["provider_id"] for r in results}
        assert returned_ids == {f"p{i}" for i in range(1, 11)}
