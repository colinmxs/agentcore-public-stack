"""Tests for SNS notification functions — send_update_summary & send_critical_failure_alert."""

import sys
import os
from unittest.mock import MagicMock

from botocore.exceptions import ClientError

_tests_dir = os.path.dirname(__file__)
if _tests_dir not in sys.path:
    sys.path.insert(0, _tests_dir)
from conftest import SNS_TOPIC_ARN


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _result(provider_id, success, display_name=None, error=None, attempts=1):
    r = {
        "provider_id": provider_id,
        "success": success,
        "display_name": display_name or f"Provider {provider_id}",
        "attempts": attempts,
    }
    if error:
        r["error"] = error
    return r


def _mock_sns(lambda_module):
    mock = MagicMock()
    lambda_module.sns = mock
    return mock


# ------------------------------------------------------------------
# send_update_summary
# ------------------------------------------------------------------

def test_update_summary_all_success(lambda_module):
    mock = _mock_sns(lambda_module)
    results = [_result(f"p{i}", True) for i in range(3)]

    lambda_module.send_update_summary(results, "v2.0.0")

    mock.publish.assert_called_once()
    kwargs = mock.publish.call_args[1]
    assert "3 succeeded, 0 failed" in kwargs["Subject"]


def test_update_summary_mixed(lambda_module):
    mock = _mock_sns(lambda_module)
    results = [
        _result("p1", True),
        _result("p2", True),
        _result("p3", False, error="timeout"),
    ]

    lambda_module.send_update_summary(results, "v2.0.0")

    kwargs = mock.publish.call_args[1]
    assert "2 succeeded, 1 failed" in kwargs["Subject"]
    assert "timeout" in kwargs["Message"]


def test_update_summary_all_failures(lambda_module):
    mock = _mock_sns(lambda_module)
    results = [
        _result("p1", False, error="err-a"),
        _result("p2", False, error="err-b"),
        _result("p3", False, error="err-c"),
    ]

    lambda_module.send_update_summary(results, "v2.0.0")

    kwargs = mock.publish.call_args[1]
    assert "0 succeeded, 3 failed" in kwargs["Subject"]
    for err in ("err-a", "err-b", "err-c"):
        assert err in kwargs["Message"]


def test_update_summary_includes_image_tag(lambda_module):
    mock = _mock_sns(lambda_module)
    results = [_result("p1", True)]

    lambda_module.send_update_summary(results, "v3.5.1")

    kwargs = mock.publish.call_args[1]
    assert "v3.5.1" in kwargs["Message"]


def test_update_summary_failure_details(lambda_module):
    mock = _mock_sns(lambda_module)
    results = [
        _result("p1", False, display_name="Acme Corp", error="connection refused", attempts=3),
    ]

    lambda_module.send_update_summary(results, "v1.0.0")

    msg = mock.publish.call_args[1]["Message"]
    assert "Acme Corp" in msg
    assert "connection refused" in msg
    assert "3" in msg


# ------------------------------------------------------------------
# send_critical_failure_alert
# ------------------------------------------------------------------

def test_critical_failure_alert_subject(lambda_module):
    mock = _mock_sns(lambda_module)
    lambda_module.send_critical_failure_alert("something broke")

    kwargs = mock.publish.call_args[1]
    assert kwargs["Subject"] == "CRITICAL: AgentCore Runtime Updater Failed"


def test_critical_failure_alert_includes_error(lambda_module):
    mock = _mock_sns(lambda_module)
    lambda_module.send_critical_failure_alert("disk full")

    kwargs = mock.publish.call_args[1]
    assert "disk full" in kwargs["Message"]


def test_critical_failure_alert_includes_timestamp(lambda_module):
    mock = _mock_sns(lambda_module)
    lambda_module.send_critical_failure_alert("oops")

    msg = mock.publish.call_args[1]["Message"]
    # Timestamp format: YYYY-MM-DDTHH:MM:SS
    import re
    assert re.search(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}", msg)


# ------------------------------------------------------------------
# SNS publish failure handled gracefully
# ------------------------------------------------------------------

def test_sns_publish_failure_handled(lambda_module):
    mock = _mock_sns(lambda_module)
    mock.publish.side_effect = ClientError(
        {"Error": {"Code": "InternalError", "Message": "SNS error"}}, "Publish"
    )

    # Should not raise
    lambda_module.send_update_summary([_result("p1", True)], "v1.0.0")
