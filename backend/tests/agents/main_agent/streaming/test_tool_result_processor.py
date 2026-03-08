"""
Tests for ToolResultProcessor — text/image extraction from tool results.

Validates: Requirements 13.1–13.4
"""

import base64
import json

import pytest

from agents.main_agent.streaming.tool_result_processor import ToolResultProcessor


# ---------------------------------------------------------------------------
# 13.1  Text content extraction
# ---------------------------------------------------------------------------

class TestTextExtraction:
    """Validates: Requirement 13.1"""

    def test_extracts_plain_text(self):
        """process_tool_result extracts text from a simple text content item."""
        tool_result = {"content": [{"text": "Hello world"}]}
        text, images = ToolResultProcessor.process_tool_result(tool_result)
        assert text == "Hello world"
        assert images == []

    def test_extracts_multiple_text_items(self):
        """Multiple text items are concatenated."""
        tool_result = {
            "content": [
                {"text": "Part one. "},
                {"text": "Part two."},
            ]
        }
        text, images = ToolResultProcessor.process_tool_result(tool_result)
        assert text == "Part one. Part two."
        assert images == []

    def test_handles_string_tool_result(self):
        """A plain string tool_result is wrapped into content automatically."""
        text, images = ToolResultProcessor.process_tool_result("raw text result")
        assert "raw text result" in text
        assert images == []

    def test_handles_json_string_tool_result(self):
        """A JSON-encoded string tool_result is parsed."""
        payload = json.dumps({"content": [{"text": "from json"}]})
        text, images = ToolResultProcessor.process_tool_result(payload)
        assert "from json" in text


# ---------------------------------------------------------------------------
# 13.2  Image content extraction
# ---------------------------------------------------------------------------

class TestImageExtraction:
    """Validates: Requirement 13.2"""

    def test_extracts_image_with_data_field(self):
        """Image content with base64 data in source.data is extracted."""
        b64 = base64.b64encode(b"fake-png-data").decode()
        tool_result = {
            "content": [
                {
                    "image": {
                        "format": "png",
                        "source": {"data": b64},
                    }
                }
            ]
        }
        text, images = ToolResultProcessor.process_tool_result(tool_result)
        assert len(images) == 1
        assert images[0]["format"] == "png"
        assert images[0]["data"] == b64

    def test_extracts_image_with_bytes_field(self):
        """Image content with raw bytes in source.bytes is base64-encoded."""
        raw_bytes = b"fake-image-bytes"
        tool_result = {
            "content": [
                {
                    "image": {
                        "format": "jpeg",
                        "source": {"bytes": raw_bytes},
                    }
                }
            ]
        }
        text, images = ToolResultProcessor.process_tool_result(tool_result)
        assert len(images) == 1
        assert images[0]["format"] == "jpeg"
        assert images[0]["data"] == base64.b64encode(raw_bytes).decode("utf-8")

    def test_extracts_image_with_string_bytes_field(self):
        """Image content with a string in source.bytes is used as-is."""
        tool_result = {
            "content": [
                {
                    "image": {
                        "format": "gif",
                        "source": {"bytes": "string-bytes-data"},
                    }
                }
            ]
        }
        text, images = ToolResultProcessor.process_tool_result(tool_result)
        assert len(images) == 1
        assert images[0]["data"] == "string-bytes-data"

    def test_image_defaults_format_to_png(self):
        """Missing format in image content defaults to 'png'."""
        tool_result = {
            "content": [
                {
                    "image": {
                        "source": {"data": "abc123"},
                    }
                }
            ]
        }
        text, images = ToolResultProcessor.process_tool_result(tool_result)
        assert len(images) == 1
        assert images[0]["format"] == "png"

    def test_mixed_text_and_images(self):
        """Both text and image items are extracted from the same result."""
        tool_result = {
            "content": [
                {"text": "Here is the chart:"},
                {
                    "image": {
                        "format": "png",
                        "source": {"data": "chartdata"},
                    }
                },
            ]
        }
        text, images = ToolResultProcessor.process_tool_result(tool_result)
        assert "Here is the chart:" in text
        assert len(images) == 1
        assert images[0]["format"] == "png"


# ---------------------------------------------------------------------------
# 13.3  JSON content with embedded images
# ---------------------------------------------------------------------------

class TestJsonContentWithImages:
    """Validates: Requirement 13.3"""

    def test_extracts_screenshot_from_json(self):
        """_process_json_content extracts screenshot images from JSON text."""
        json_data = {
            "result": "success",
            "screenshot": {
                "format": "png",
                "data": "base64screenshotdata",
            },
        }
        json_text = json.dumps(json_data)
        images, cleaned = ToolResultProcessor._process_json_content(json_text)
        assert len(images) == 1
        assert images[0]["format"] == "png"
        assert images[0]["data"] == "base64screenshotdata"
        # Cleaned text should not contain the raw base64 data
        assert "base64screenshotdata" not in cleaned

    def test_extracts_image_field_from_json(self):
        """_process_json_content extracts 'image' field from JSON."""
        json_data = {
            "image": {
                "format": "jpeg",
                "data": "jpegdata",
            }
        }
        images, cleaned = ToolResultProcessor._process_json_content(json.dumps(json_data))
        assert len(images) == 1
        assert images[0]["format"] == "jpeg"

    def test_extracts_images_array_from_json(self):
        """_process_json_content extracts from 'images' array field."""
        json_data = {
            "images": [
                {"format": "png", "data": "img1"},
                {"format": "jpeg", "data": "img2"},
            ]
        }
        images, cleaned = ToolResultProcessor._process_json_content(json.dumps(json_data))
        assert len(images) == 2

    def test_cleans_text_removes_large_base64(self):
        """Cleaned text replaces base64 data with metadata note."""
        json_data = {
            "chart": {
                "format": "png",
                "data": "A" * 1000,
            },
            "summary": "Chart generated",
        }
        images, cleaned = ToolResultProcessor._process_json_content(json.dumps(json_data))
        assert len(images) == 1
        parsed_cleaned = json.loads(cleaned)
        assert parsed_cleaned["chart"]["note"] == "Image data extracted and displayed separately"
        assert parsed_cleaned["summary"] == "Chart generated"

    def test_non_json_text_returns_unchanged(self):
        """Non-JSON text passes through _process_json_content unchanged."""
        plain_text = "This is not JSON"
        images, cleaned = ToolResultProcessor._process_json_content(plain_text)
        assert images == []
        assert cleaned == plain_text

    def test_json_without_images_returns_unchanged(self):
        """JSON without image fields returns empty images and original text."""
        json_text = json.dumps({"status": "ok", "count": 42})
        images, cleaned = ToolResultProcessor._process_json_content(json_text)
        assert images == []
        assert cleaned == json_text

    def test_skips_optimized_screenshot_format(self):
        """Optimized screenshot references (available + description) are skipped."""
        json_data = {
            "screenshot": {
                "available": True,
                "description": "Page loaded successfully",
            }
        }
        images, cleaned = ToolResultProcessor._process_json_content(json.dumps(json_data))
        assert images == []


# ---------------------------------------------------------------------------
# 13.4  Empty / no content
# ---------------------------------------------------------------------------

class TestEmptyContent:
    """Validates: Requirement 13.4"""

    def test_empty_content_list(self):
        """Tool result with empty content list returns empty text and images."""
        tool_result = {"content": []}
        text, images = ToolResultProcessor.process_tool_result(tool_result)
        assert text == ""
        assert images == []

    def test_no_content_key(self):
        """Tool result without content key returns empty text and images."""
        tool_result = {"toolUseId": "tu-123"}
        text, images = ToolResultProcessor.process_tool_result(tool_result)
        assert text == ""
        assert images == []

    def test_content_with_empty_dict_items(self):
        """Content items that are empty dicts produce no text or images."""
        tool_result = {"content": [{}]}
        text, images = ToolResultProcessor.process_tool_result(tool_result)
        assert text == ""
        assert images == []
