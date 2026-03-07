"""
Property-based tests for Auth & RBAC permission system.

Shared Hypothesis strategies and smoke tests for generating valid
User, AppRole, OIDCStateData, and related model instances.

Feature: auth-rbac-tests
"""

import string

from hypothesis import given, settings, strategies as st

from apis.shared.auth.models import User
from apis.shared.auth.state_store import OIDCStateData
from apis.shared.rbac.models import AppRole, EffectivePermissions


# ---------------------------------------------------------------------------
# Shared Hypothesis strategies
# ---------------------------------------------------------------------------

# Role name strategy
st_role_name = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="_-"),
    min_size=1,
    max_size=30,
)

# Tool/model ID strategy
st_tool_id = st.text(
    alphabet=st.characters(whitelist_categories=("L", "N"), whitelist_characters="_-:."),
    min_size=1,
    max_size=50,
)


@st.composite
def st_app_role(draw):
    """Generate a random AppRole with valid effective permissions."""
    return AppRole(
        role_id=draw(st.text(min_size=3, max_size=20, alphabet=string.ascii_lowercase)),
        display_name=draw(st.text(min_size=1, max_size=50)),
        description="",
        effective_permissions=EffectivePermissions(
            tools=draw(st.lists(st_tool_id, max_size=10)),
            models=draw(st.lists(st_tool_id, max_size=10)),
            quota_tier=draw(
                st.one_of(
                    st.none(),
                    st.sampled_from(["free", "basic", "pro", "enterprise"]),
                )
            ),
        ),
        priority=draw(st.integers(min_value=0, max_value=999)),
        enabled=True,
    )


@st.composite
def st_user(draw):
    """Generate a random User with valid fields."""
    return User(
        email=draw(st.emails()),
        user_id=draw(st.uuids().map(str)),
        name=draw(st.text(min_size=1, max_size=50)),
        roles=draw(st.lists(st_role_name, max_size=10)),
    )


@st.composite
def st_oidc_state_data(draw):
    """Generate a random OIDCStateData with optional fields."""
    return OIDCStateData(
        redirect_uri=draw(st.one_of(st.none(), st.text(min_size=1, max_size=100))),
        code_verifier=draw(st.one_of(st.none(), st.text(min_size=43, max_size=128))),
        nonce=draw(st.one_of(st.none(), st.text(min_size=1, max_size=64))),
        provider_id=draw(st.one_of(st.none(), st.text(min_size=1, max_size=30))),
    )


# ---------------------------------------------------------------------------
# Smoke tests — verify strategies generate valid instances
# ---------------------------------------------------------------------------


@given(role=st_app_role())
@settings(max_examples=100)
def test_st_app_role_generates_valid_instances(role):
    """Validates: Requirements 15.1"""
    assert isinstance(role, AppRole)
    assert len(role.role_id) >= 3
    assert role.enabled is True
    assert isinstance(role.effective_permissions, EffectivePermissions)
    assert isinstance(role.effective_permissions.tools, list)
    assert isinstance(role.effective_permissions.models, list)
    assert role.priority >= 0


@given(user=st_user())
@settings(max_examples=100)
def test_st_user_generates_valid_instances(user):
    """Validates: Requirements 15.1"""
    assert isinstance(user, User)
    assert len(user.email) > 0
    assert len(user.user_id) > 0
    assert len(user.name) >= 1
    assert isinstance(user.roles, list)


@given(data=st_oidc_state_data())
@settings(max_examples=100)
def test_st_oidc_state_data_generates_valid_instances(data):
    """Validates: Requirements 15.1"""
    assert isinstance(data, OIDCStateData)
    if data.code_verifier is not None:
        assert len(data.code_verifier) >= 43


@given(name=st_role_name)
@settings(max_examples=100)
def test_st_role_name_generates_valid_strings(name):
    """Validates: Requirements 15.1"""
    assert isinstance(name, str)
    assert 1 <= len(name) <= 30


@given(tid=st_tool_id)
@settings(max_examples=100)
def test_st_tool_id_generates_valid_strings(tid):
    """Validates: Requirements 15.1"""
    assert isinstance(tid, str)
    assert 1 <= len(tid) <= 50
