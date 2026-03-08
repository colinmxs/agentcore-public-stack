"""Tests for runtime name generation edge cases."""
import sys
import os

_tests_dir = os.path.dirname(__file__)
if _tests_dir not in sys.path:
    sys.path.insert(0, _tests_dir)
from conftest import make_insert_event, PROJECT_PREFIX


class TestRuntimeNameGeneration:

    def _get_runtime_name(self, mod, bedrock, provider_id):
        """Fire an INSERT event and return the agentRuntimeName passed to bedrock."""
        event = make_insert_event(
            provider_id=provider_id,
            issuer_url='https://auth.example.com',
            client_id='client1',
        )
        mod.lambda_handler(event, {})
        call_kwargs = bedrock.create_agent_runtime.call_args[1]
        return call_kwargs['agentRuntimeName']

    def test_name_simple(self, lambda_module):
        mod, bedrock = lambda_module
        name = self._get_runtime_name(mod, bedrock, 'prov1')
        assert name == 'test_project_runtime_prov1'

    def test_name_hyphens_replaced(self, lambda_module):
        mod, bedrock = lambda_module
        name = self._get_runtime_name(mod, bedrock, 'my-provider')
        assert name == 'test_project_runtime_my_provider'

    def test_name_exactly_48_chars(self, lambda_module):
        mod, bedrock = lambda_module
        # "test_project_runtime_" is 21 chars, so we need 27 more
        provider_id = 'a' * 27
        name = self._get_runtime_name(mod, bedrock, provider_id)
        assert len(name) == 48
        assert name == f'test_project_runtime_{provider_id}'

    def test_name_over_48_chars(self, lambda_module):
        mod, bedrock = lambda_module
        provider_id = 'a' * 40
        name = self._get_runtime_name(mod, bedrock, provider_id)
        assert len(name) <= 48
        assert name.startswith('r_')

    def test_name_truncated_format(self, lambda_module):
        mod, bedrock = lambda_module
        provider_id = 'very-long-provider-id-that-exceeds-the-maximum-allowed-length'
        name = self._get_runtime_name(mod, bedrock, provider_id)
        assert name.startswith('r_')
        assert len(name) <= 48

    def test_name_all_hyphens_converted(self, lambda_module):
        mod, bedrock = lambda_module
        name = self._get_runtime_name(mod, bedrock, 'a-b-c')
        assert '-' not in name
        assert name == 'test_project_runtime_a_b_c'

    def test_name_short_provider(self, lambda_module):
        mod, bedrock = lambda_module
        name = self._get_runtime_name(mod, bedrock, 'x')
        assert name == 'test_project_runtime_x'
