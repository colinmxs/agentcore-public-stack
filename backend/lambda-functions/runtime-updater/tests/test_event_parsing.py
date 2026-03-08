"""Tests for EventBridge event extraction and SSM parameter functions."""

import sys
import os

import pytest

_tests_dir = os.path.dirname(__file__)
if _tests_dir not in sys.path:
    sys.path.insert(0, _tests_dir)

from conftest import make_ssm_change_event, PROJECT_PREFIX


def test_extract_valid_event(lambda_module):
    """Correct parameter name → returns image tag from SSM."""
    event = make_ssm_change_event()
    result = lambda_module.extract_image_tag_from_event(event)
    assert result == "v1.0.0"


def test_extract_wrong_parameter_name(lambda_module):
    """Different SSM param name → returns None."""
    event = make_ssm_change_event(parameter_name="/other/project/param")
    result = lambda_module.extract_image_tag_from_event(event)
    assert result is None


def test_extract_missing_detail(lambda_module):
    """No 'detail' key → returns None."""
    event = {"source": "aws.ssm", "detail-type": "Parameter Store Change"}
    result = lambda_module.extract_image_tag_from_event(event)
    assert result is None


def test_extract_empty_detail(lambda_module):
    """Empty detail dict → returns None."""
    event = {
        "source": "aws.ssm",
        "detail-type": "Parameter Store Change",
        "detail": {},
    }
    result = lambda_module.extract_image_tag_from_event(event)
    assert result is None


def test_extract_missing_name_field(lambda_module):
    """detail has no 'name' → returns None."""
    event = {
        "source": "aws.ssm",
        "detail-type": "Parameter Store Change",
        "detail": {"operation": "Update"},
    }
    result = lambda_module.extract_image_tag_from_event(event)
    assert result is None


def test_get_image_tag_from_ssm(lambda_module):
    """Returns 'v1.0.0' (pre-populated by conftest)."""
    tag = lambda_module.get_image_tag_from_ssm()
    assert tag == "v1.0.0"


def test_get_image_tag_ssm_error(lambda_module):
    """Delete the SSM param first, then call → raises ValueError."""
    lambda_module.ssm.delete_parameter(
        Name=f"/{PROJECT_PREFIX}/inference-api/image-tag"
    )
    with pytest.raises(ValueError, match="Image tag not found"):
        lambda_module.get_image_tag_from_ssm()


def test_get_container_image_uri(lambda_module):
    """Returns full {repo_uri}:{tag} format."""
    uri = lambda_module.get_container_image_uri("v2.0.0")
    assert uri == "123456789012.dkr.ecr.us-east-1.amazonaws.com/test-repo:v2.0.0"


def test_get_container_image_uri_missing_repo(lambda_module):
    """Delete ECR repo SSM param → raises ValueError."""
    lambda_module.ssm.delete_parameter(
        Name=f"/{PROJECT_PREFIX}/inference-api/ecr-repository-uri"
    )
    with pytest.raises(ValueError, match="ECR repository URI not found"):
        lambda_module.get_container_image_uri("v2.0.0")
