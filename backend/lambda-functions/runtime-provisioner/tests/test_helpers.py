"""Tests for runtime-provisioner helper functions."""
import sys
import os

import pytest
from botocore.exceptions import ClientError

_tests_dir = os.path.dirname(__file__)
if _tests_dir not in sys.path:
    sys.path.insert(0, _tests_dir)
from conftest import PROJECT_PREFIX, AUTH_PROVIDERS_TABLE, SSM_PARAMS


# ── deserialize_dynamodb_value ──────────────────────────────────────────────

class TestDeserializeDynamoDBValue:

    def test_deserialize_string(self, lambda_module):
        mod, _ = lambda_module
        assert mod.deserialize_dynamodb_value({'S': 'hello'}) == 'hello'

    def test_deserialize_number(self, lambda_module):
        mod, _ = lambda_module
        assert mod.deserialize_dynamodb_value({'N': '42'}) == '42'

    def test_deserialize_bool_true(self, lambda_module):
        mod, _ = lambda_module
        assert mod.deserialize_dynamodb_value({'BOOL': True}) is True

    def test_deserialize_bool_false(self, lambda_module):
        mod, _ = lambda_module
        assert mod.deserialize_dynamodb_value({'BOOL': False}) is False

    def test_deserialize_null(self, lambda_module):
        mod, _ = lambda_module
        assert mod.deserialize_dynamodb_value({'NULL': True}) is None

    def test_deserialize_list(self, lambda_module):
        mod, _ = lambda_module
        result = mod.deserialize_dynamodb_value({'L': [{'S': 'a'}, {'N': '1'}]})
        assert result == ['a', '1']

    def test_deserialize_map(self, lambda_module):
        mod, _ = lambda_module
        result = mod.deserialize_dynamodb_value({'M': {'key': {'S': 'val'}}})
        assert result == {'key': 'val'}

    def test_deserialize_empty(self, lambda_module):
        mod, _ = lambda_module
        assert mod.deserialize_dynamodb_value({}) is None

    def test_deserialize_none(self, lambda_module):
        mod, _ = lambda_module
        assert mod.deserialize_dynamodb_value(None) is None

    def test_deserialize_nested(self, lambda_module):
        mod, _ = lambda_module
        result = mod.deserialize_dynamodb_value(
            {'M': {'items': {'L': [{'S': 'x'}]}}}
        )
        assert result == {'items': ['x']}


# ── normalize_url ───────────────────────────────────────────────────────────

class TestNormalizeUrl:

    def test_normalize_url_with_https(self, lambda_module):
        mod, _ = lambda_module
        assert mod.normalize_url('https://example.com') == 'https://example.com'

    def test_normalize_url_with_http(self, lambda_module):
        mod, _ = lambda_module
        assert mod.normalize_url('http://example.com') == 'http://example.com'

    def test_normalize_url_bare_domain(self, lambda_module):
        mod, _ = lambda_module
        assert mod.normalize_url('example.com') == 'https://example.com'

    def test_normalize_url_empty(self, lambda_module):
        mod, _ = lambda_module
        assert mod.normalize_url('') == ''

    def test_normalize_url_whitespace(self, lambda_module):
        mod, _ = lambda_module
        assert mod.normalize_url('  example.com  ') == 'https://example.com'


# ── validate_url ────────────────────────────────────────────────────────────

class TestValidateUrl:

    def test_validate_url_valid(self, lambda_module):
        mod, _ = lambda_module
        assert mod.validate_url('example.com', 'test_param') == 'https://example.com'

    def test_validate_url_empty_raises(self, lambda_module):
        mod, _ = lambda_module
        with pytest.raises(ValueError, match='Empty URL value for test_param'):
            mod.validate_url('', 'test_param')

    def test_validate_url_whitespace_only_raises(self, lambda_module):
        mod, _ = lambda_module
        with pytest.raises(ValueError, match='Empty URL value for test_param'):
            mod.validate_url('   ', 'test_param')


# ── determine_discovery_url ─────────────────────────────────────────────────

class TestDetermineDiscoveryUrl:

    def test_discovery_url_basic(self, lambda_module):
        mod, _ = lambda_module
        result = mod.determine_discovery_url('https://auth.example.com', None)
        assert result == 'https://auth.example.com/.well-known/openid-configuration'

    def test_discovery_url_trailing_slash(self, lambda_module):
        mod, _ = lambda_module
        result = mod.determine_discovery_url('https://auth.example.com/', None)
        assert result == 'https://auth.example.com/.well-known/openid-configuration'


# ── SSM helpers ─────────────────────────────────────────────────────────────

class TestSSMHelpers:

    def test_get_optional_parameter_found(self, lambda_module):
        mod, _ = lambda_module
        param = f"/{PROJECT_PREFIX}/inference-api/image-tag"
        assert mod.get_optional_parameter(param) == 'latest'

    def test_get_optional_parameter_not_found(self, lambda_module):
        mod, _ = lambda_module
        assert mod.get_optional_parameter('/nonexistent/param') is None

    def test_get_required_parameter_found(self, lambda_module):
        mod, _ = lambda_module
        param = f"/{PROJECT_PREFIX}/inference-api/image-tag"
        assert mod.get_required_parameter(param) == 'latest'

    def test_get_required_parameter_not_found_raises(self, lambda_module):
        mod, _ = lambda_module
        with pytest.raises(ClientError):
            mod.get_required_parameter('/nonexistent/param')

    def test_get_container_image_tag(self, lambda_module):
        mod, _ = lambda_module
        assert mod.get_container_image_tag() == 'latest'

    def test_get_container_image_uri(self, lambda_module):
        mod, _ = lambda_module
        uri = mod.get_container_image_uri('latest')
        expected = '123456789012.dkr.ecr.us-east-1.amazonaws.com/test-repo:latest'
        assert uri == expected

    def test_get_runtime_execution_role_arn(self, lambda_module):
        mod, _ = lambda_module
        arn = mod.get_runtime_execution_role_arn()
        assert arn == 'arn:aws:iam::123456789012:role/test-runtime-role'

    def test_get_shared_resource_ids(self, lambda_module):
        mod, _ = lambda_module
        result = mod.get_shared_resource_ids()
        assert result['memory_arn'] == 'arn:aws:bedrock:us-east-1:123456789012:memory/test-memory'
        assert result['memory_id'] == 'test-memory-id'
        assert result['code_interpreter_id'] == 'test-code-interpreter-id'
        assert result['browser_id'] == 'test-browser-id'
        assert result['gateway_url'] == 'https://gateway.example.com'

    def test_store_runtime_arn_in_ssm(self, lambda_module):
        mod, _ = lambda_module
        mod.store_runtime_arn_in_ssm('prov1', 'arn:aws:bedrock:us-east-1:123456789012:runtime/rt-1')
        resp = mod.ssm.get_parameter(Name=f'/{PROJECT_PREFIX}/runtimes/prov1/arn')
        assert resp['Parameter']['Value'] == 'arn:aws:bedrock:us-east-1:123456789012:runtime/rt-1'

    def test_delete_runtime_arn_from_ssm(self, lambda_module):
        mod, _ = lambda_module
        mod.store_runtime_arn_in_ssm('prov2', 'arn:aws:bedrock:us-east-1:123456789012:runtime/rt-2')
        mod.delete_runtime_arn_from_ssm('prov2')
        with pytest.raises(ClientError):
            mod.ssm.get_parameter(Name=f'/{PROJECT_PREFIX}/runtimes/prov2/arn')

    def test_delete_runtime_arn_not_found_ok(self, lambda_module):
        mod, _ = lambda_module
        # Should not raise even if param doesn't exist
        mod.delete_runtime_arn_from_ssm('nonexistent-provider')


# ── DynamoDB update helpers ─────────────────────────────────────────────────

def _insert_provider(mod, provider_id):
    """Insert a minimal provider record for update tests."""
    mod.dynamodb.put_item(
        TableName=AUTH_PROVIDERS_TABLE,
        Item={
            'PK': {'S': f'AUTH_PROVIDER#{provider_id}'},
            'SK': {'S': f'AUTH_PROVIDER#{provider_id}'},
            'providerId': {'S': provider_id},
        },
    )


def _get_provider(mod, provider_id):
    """Read back a provider record."""
    resp = mod.dynamodb.get_item(
        TableName=AUTH_PROVIDERS_TABLE,
        Key={
            'PK': {'S': f'AUTH_PROVIDER#{provider_id}'},
            'SK': {'S': f'AUTH_PROVIDER#{provider_id}'},
        },
    )
    return resp['Item']


class TestDynamoDBUpdateHelpers:

    def test_update_provider_runtime_info(self, lambda_module):
        mod, _ = lambda_module
        _insert_provider(mod, 'prov1')
        mod.update_provider_runtime_info(
            'prov1',
            'arn:aws:bedrock:us-east-1:123456789012:runtime/rt-1',
            'rt-1',
            'https://endpoint.example.com',
            'READY',
        )
        item = _get_provider(mod, 'prov1')
        assert item['agentcoreRuntimeArn']['S'] == 'arn:aws:bedrock:us-east-1:123456789012:runtime/rt-1'
        assert item['agentcoreRuntimeId']['S'] == 'rt-1'
        assert item['agentcoreRuntimeEndpointUrl']['S'] == 'https://endpoint.example.com'
        assert item['agentcoreRuntimeStatus']['S'] == 'READY'
        assert 'updatedAt' in item

    def test_update_provider_runtime_status(self, lambda_module):
        mod, _ = lambda_module
        _insert_provider(mod, 'prov2')
        mod.update_provider_runtime_status('prov2', 'PROVISIONING')
        item = _get_provider(mod, 'prov2')
        assert item['agentcoreRuntimeStatus']['S'] == 'PROVISIONING'

    def test_update_provider_runtime_error(self, lambda_module):
        mod, _ = lambda_module
        _insert_provider(mod, 'prov3')
        mod.update_provider_runtime_error('prov3', 'Something went wrong')
        item = _get_provider(mod, 'prov3')
        assert item['agentcoreRuntimeStatus']['S'] == 'FAILED'
        assert item['agentcoreRuntimeError']['S'] == 'Something went wrong'

    def test_update_provider_runtime_error_truncation(self, lambda_module):
        mod, _ = lambda_module
        _insert_provider(mod, 'prov4')
        long_error = 'x' * 2000
        mod.update_provider_runtime_error('prov4', long_error)
        item = _get_provider(mod, 'prov4')
        assert len(item['agentcoreRuntimeError']['S']) == 1000
