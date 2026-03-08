"""
Tests for StreamEventFormatter — SSE event formatting and final-result extraction.

Validates: Requirements 12.1–12.8
"""

import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from agents.main_agent.streaming.event_formatter import StreamEventFormatter


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_sse(sse_string: str) -> dict:
    """Strip the SSE envelope and return the parsed JSON payload."""
    assert sse_string.startswith("data: ")
    assert sse_string.endswith("\n\n")
    return json.loads(sse_string[len("data: "):-2])


# ---------------------------------------------------------------------------
# 12.1  format_sse_event produces "data: {json}\n\n"
# ---------------------------------------------------------------------------

class TestFormatSseEvent:
    """Validates: Requirement 12.1, 12.2"""

    def test_basic_format(self):
        """format_sse_event wraps a dict in the SSE wire format."""
        result = StreamEventFormatter.format_sse_event({"type": "ping"})
        assert result.startswith("data: ")
        assert result.endswith("\n\n")
        payload = json.loads(result[len("data: "):-2])
        assert payload == {"type": "ping"}

    def test_complex_payload(self):
        """Nested dicts and lists serialise correctly."""
        data = {"type": "response", "items": [1, 2, 3], "nested": {"a": True}}
        payload = _parse_sse(StreamEventFormatter.format_sse_event(data))
        assert payload == data

    # 12.2  Non-serializable objects → error event (no exception)
    def test_non_serializable_returns_error_event(self):
        """Non-serializable values produce an error event instead of raising."""
        bad_data = {"obj": object()}
        result = StreamEventFormatter.format_sse_event(bad_data)
        payload = _parse_sse(result)
        assert payload["type"] == "error"
        assert "Serialization error" in payload["message"]


# ---------------------------------------------------------------------------
# 12.3  create_init_event
# ---------------------------------------------------------------------------

class TestCreateInitEvent:
    """Validates: Requirement 12.3"""

    def test_init_event_type(self):
        payload = _parse_sse(StreamEventFormatter.create_init_event())
        assert payload["type"] == "init"

    def test_init_event_has_message(self):
        payload = _parse_sse(StreamEventFormatter.create_init_event())
        assert "message" in payload


# ---------------------------------------------------------------------------
# 12.4  create_response_event
# ---------------------------------------------------------------------------

class TestCreateResponseEvent:
    """Validates: Requirement 12.4"""

    def test_response_event_type_and_text(self):
        payload = _parse_sse(StreamEventFormatter.create_response_event("hello"))
        assert payload["type"] == "response"
        assert payload["text"] == "hello"

    def test_response_event_empty_text(self):
        payload = _parse_sse(StreamEventFormatter.create_response_event(""))
        assert payload["type"] == "response"
        assert payload["text"] == ""


# ---------------------------------------------------------------------------
# 12.5  create_tool_use_event
# ---------------------------------------------------------------------------

class TestCreateToolUseEvent:
    """Validates: Requirement 12.5"""

    def test_tool_use_event_fields(self):
        tool_use = {
            "toolUseId": "tu-123",
            "name": "calculator",
            "input": {"expression": "2+2"},
        }
        payload = _parse_sse(StreamEventFormatter.create_tool_use_event(tool_use))
        assert payload["type"] == "tool_use"
        assert payload["toolUseId"] == "tu-123"
        assert payload["name"] == "calculator"
        assert payload["input"] == {"expression": "2+2"}

    def test_tool_use_event_missing_input_defaults_empty(self):
        tool_use = {"toolUseId": "tu-456", "name": "search"}
        payload = _parse_sse(StreamEventFormatter.create_tool_use_event(tool_use))
        assert payload["input"] == {}


# ---------------------------------------------------------------------------
# 12.6  create_complete_event
# ---------------------------------------------------------------------------

class TestCreateCompleteEvent:
    """Validates: Requirement 12.6"""

    def test_complete_event_basic(self):
        payload = _parse_sse(StreamEventFormatter.create_complete_event("Done"))
        assert payload["type"] == "complete"
        assert payload["message"] == "Done"

    def test_complete_event_with_images(self):
        images = [{"format": "png", "data": "abc123"}]
        payload = _parse_sse(
            StreamEventFormatter.create_complete_event("Done", images=images)
        )
        assert payload["images"] == images

    def test_complete_event_with_usage(self):
        usage = {"inputTokens": 100, "outputTokens": 50}
        payload = _parse_sse(
            StreamEventFormatter.create_complete_event("Done", usage=usage)
        )
        assert payload["usage"] == usage

    def test_complete_event_no_optional_fields(self):
        payload = _parse_sse(StreamEventFormatter.create_complete_event("Done"))
        assert "images" not in payload
        assert "usage" not in payload


# ---------------------------------------------------------------------------
# 12.7  create_error_event
# ---------------------------------------------------------------------------

class TestCreateErrorEvent:
    """Validates: Requirement 12.7"""

    def test_error_event_type_and_message(self):
        payload = _parse_sse(
            StreamEventFormatter.create_error_event("something broke")
        )
        assert payload["type"] == "error"
        assert payload["message"] == "something broke"


# ---------------------------------------------------------------------------
# 12.8  extract_final_result_data
# ---------------------------------------------------------------------------

class TestExtractFinalResultData:
    """Validates: Requirement 12.8"""

    def test_extracts_text_parts(self):
        """Text items in message.content are joined into result_text."""
        content = [{"text": "Hello"}, {"text": "World"}]
        final_result = SimpleNamespace(
            message=SimpleNamespace(content=content)
        )
        images, text = StreamEventFormatter.extract_final_result_data(final_result)
        assert text == "Hello World"
        assert images == []

    def test_extracts_image_data(self):
        """Image items are extracted with format and data."""
        content = [
            {
                "image": {
                    "format": "png",
                    "source": {"data": "base64data"},
                }
            }
        ]
        final_result = SimpleNamespace(
            message=SimpleNamespace(content=content)
        )
        images, text = StreamEventFormatter.extract_final_result_data(final_result)
        assert len(images) == 1
        assert images[0]["format"] == "png"
        assert images[0]["data"] == "base64data"

    def test_mixed_text_and_images(self):
        """Both text and images are extracted from mixed content."""
        content = [
            {"text": "Here is an image:"},
            {
                "image": {
                    "format": "jpeg",
                    "source": {"data": "imgdata"},
                }
            },
        ]
        final_result = SimpleNamespace(
            message=SimpleNamespace(content=content)
        )
        images, text = StreamEventFormatter.extract_final_result_data(final_result)
        assert text == "Here is an image:"
        assert len(images) == 1
        assert images[0]["format"] == "jpeg"

    def test_no_message_attribute_falls_back_to_str(self):
        """Objects without .message.content fall back to str(final_result)."""
        images, text = StreamEventFormatter.extract_final_result_data("plain string")
        assert text == "plain string"
        assert images == []

    def test_empty_content_list(self):
        """Empty content list falls back to str(final_result)."""
        final_result = SimpleNamespace(
            message=SimpleNamespace(content=[])
        )
        images, text = StreamEventFormatter.extract_final_result_data(final_result)
        assert images == []
        # No text_parts collected, so result_text stays as str(final_result)
        assert isinstance(text, str)
