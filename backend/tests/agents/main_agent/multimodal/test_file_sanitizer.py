"""
Tests for FileSanitizer — filename sanitization for AWS Bedrock compatibility.

Validates: Requirements 10.1–10.3
"""

from agents.main_agent.multimodal.file_sanitizer import FileSanitizer


class TestSanitizeFilenameSpecialCharacters:
    """Req 10.1: replaces special characters with underscores, preserves allowed chars."""

    def test_replaces_at_sign(self):
        assert FileSanitizer.sanitize_filename("file@name") == "file_name"

    def test_replaces_hash(self):
        assert FileSanitizer.sanitize_filename("file#name") == "file_name"

    def test_replaces_dollar(self):
        assert FileSanitizer.sanitize_filename("price$100") == "price_100"

    def test_replaces_multiple_special_chars(self):
        assert FileSanitizer.sanitize_filename("a!b@c#d") == "a_b_c_d"

    def test_preserves_alphanumeric(self):
        assert FileSanitizer.sanitize_filename("abc123XYZ") == "abc123XYZ"

    def test_preserves_hyphens(self):
        assert FileSanitizer.sanitize_filename("my-file-name") == "my-file-name"

    def test_preserves_parentheses(self):
        assert FileSanitizer.sanitize_filename("file(1)") == "file(1)"

    def test_preserves_square_brackets(self):
        assert FileSanitizer.sanitize_filename("file[v2]") == "file[v2]"

    def test_preserves_spaces(self):
        assert FileSanitizer.sanitize_filename("my file") == "my file"

    def test_replaces_dots(self):
        assert FileSanitizer.sanitize_filename("report.final.pdf") == "report_final_pdf"


class TestSanitizeFilenameWhitespace:
    """Req 10.2: collapses consecutive whitespace into a single space."""

    def test_collapses_double_space(self):
        assert FileSanitizer.sanitize_filename("hello  world") == "hello world"

    def test_collapses_multiple_spaces(self):
        assert FileSanitizer.sanitize_filename("a     b") == "a b"

    def test_collapses_tabs(self):
        assert FileSanitizer.sanitize_filename("hello\tworld") == "hello world"

    def test_collapses_mixed_whitespace(self):
        assert FileSanitizer.sanitize_filename("a \t\n b") == "a b"


class TestSanitizeFilenameTrimming:
    """Req 10.3: trims leading and trailing whitespace."""

    def test_trims_leading_spaces(self):
        assert FileSanitizer.sanitize_filename("  hello") == "hello"

    def test_trims_trailing_spaces(self):
        assert FileSanitizer.sanitize_filename("hello  ") == "hello"

    def test_trims_both_sides(self):
        assert FileSanitizer.sanitize_filename("  hello  ") == "hello"

    def test_empty_string(self):
        assert FileSanitizer.sanitize_filename("") == ""

    def test_only_whitespace(self):
        assert FileSanitizer.sanitize_filename("   ") == ""
