"""Unit tests for PKCE code verifier and challenge generation.

Covers:
- Verifier length 43–128 characters (Req 9.2)
- Challenge equals BASE64URL(SHA256(verifier)) with padding stripped (Req 9.3)
- Uniqueness across calls (Req 9.5)
"""

import base64
import hashlib

from apis.app_api.auth.service import generate_pkce_pair


class TestVerifierLength:
    """Req 9.2: code_verifier is between 43 and 128 characters."""

    def test_verifier_within_bounds(self):
        verifier, _ = generate_pkce_pair()
        assert 43 <= len(verifier) <= 128

    def test_verifier_length_consistent_across_calls(self):
        for _ in range(20):
            verifier, _ = generate_pkce_pair()
            assert 43 <= len(verifier) <= 128


class TestChallengeCorrectness:
    """Req 9.3: code_challenge equals BASE64URL(SHA256(code_verifier)) with padding stripped."""

    def test_challenge_matches_sha256_of_verifier(self):
        verifier, challenge = generate_pkce_pair()

        digest = hashlib.sha256(verifier.encode("ascii")).digest()
        expected = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")

        assert challenge == expected

    def test_challenge_has_no_padding(self):
        _, challenge = generate_pkce_pair()
        assert "=" not in challenge

    def test_challenge_uses_url_safe_alphabet(self):
        """BASE64URL uses A-Z, a-z, 0-9, '-', '_' only."""
        _, challenge = generate_pkce_pair()
        allowed = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
        assert all(c in allowed for c in challenge)


class TestUniqueness:
    """Req 9.5: generate_pkce_pair() produces unique verifiers each time."""

    def test_verifiers_are_unique(self):
        verifiers = {generate_pkce_pair()[0] for _ in range(50)}
        assert len(verifiers) == 50

    def test_challenges_are_unique(self):
        challenges = {generate_pkce_pair()[1] for _ in range(50)}
        assert len(challenges) == 50
