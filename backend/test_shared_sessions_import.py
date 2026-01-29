#!/usr/bin/env python3
"""Test script to verify shared sessions module can be imported without errors

This script tests:
1. All model imports from apis.shared.sessions.models
2. All metadata operation imports from apis.shared.sessions.metadata
3. All message operation imports from apis.shared.sessions.messages
4. Module-level imports from apis.shared.sessions
5. No circular dependencies
6. No missing dependencies
"""

import sys
import traceback
from pathlib import Path

# Add src to path
src_path = Path(__file__).parent / "src"
sys.path.insert(0, str(src_path))

def test_models_import():
    """Test importing all models from shared sessions module"""
    print("Testing models import...")
    try:
        from apis.shared.sessions.models import (
            # Session models
            SessionMetadata,
            SessionPreferences,
            SessionMetadataResponse,
            SessionsListResponse,
            UpdateSessionMetadataRequest,
            BulkDeleteSessionsRequest,
            BulkDeleteSessionResult,
            BulkDeleteSessionsResponse,
            # Message models
            Message,
            MessageContent,
            MessageResponse,
            MessagesListResponse,
            MessageMetadata,
            LatencyMetrics,
            TokenUsage,
            ModelInfo,
            PricingSnapshot,
            Attribution,
            Citation,
        )
        print("✅ All models imported successfully")
        return True
    except Exception as e:
        print(f"❌ Failed to import models: {e}")
        traceback.print_exc()
        return False


def test_metadata_import():
    """Test importing metadata operations"""
    print("\nTesting metadata operations import...")
    try:
        from apis.shared.sessions.metadata import (
            store_message_metadata,
            store_session_metadata,
            get_session_metadata,
            get_all_message_metadata,
            list_user_sessions,
        )
        print("✅ All metadata operations imported successfully")
        return True
    except Exception as e:
        print(f"❌ Failed to import metadata operations: {e}")
        traceback.print_exc()
        return False


def test_messages_import():
    """Test importing message operations"""
    print("\nTesting message operations import...")
    try:
        from apis.shared.sessions.messages import (
            get_messages,
            get_messages_from_cloud,
            get_messages_from_local,
        )
        print("✅ All message operations imported successfully")
        return True
    except Exception as e:
        print(f"❌ Failed to import message operations: {e}")
        traceback.print_exc()
        return False


def test_module_level_import():
    """Test importing from module level"""
    print("\nTesting module-level import...")
    try:
        from apis.shared.sessions import (
            # Session models
            SessionMetadata,
            SessionPreferences,
            # Message models
            Message,
            MessageContent,
            # Metadata operations
            store_message_metadata,
            store_session_metadata,
            # Message operations
            get_messages,
        )
        print("✅ Module-level imports work correctly")
        return True
    except Exception as e:
        print(f"❌ Failed module-level import: {e}")
        traceback.print_exc()
        return False


def test_no_circular_dependencies():
    """Test that there are no circular dependencies"""
    print("\nTesting for circular dependencies...")
    try:
        # Import in different orders to detect circular deps
        import apis.shared.sessions.models
        import apis.shared.sessions.metadata
        import apis.shared.sessions.messages
        
        # Try reverse order
        import apis.shared.sessions.messages
        import apis.shared.sessions.metadata
        import apis.shared.sessions.models
        
        print("✅ No circular dependencies detected")
        return True
    except Exception as e:
        print(f"❌ Circular dependency detected: {e}")
        traceback.print_exc()
        return False


def test_model_instantiation():
    """Test that models can be instantiated"""
    print("\nTesting model instantiation...")
    try:
        from apis.shared.sessions import SessionMetadata, Message, MessageContent
        
        # Test SessionMetadata
        session = SessionMetadata(
            session_id="test-123",
            user_id="user-456",
            title="Test Session",
            status="active",
            created_at="2025-01-15T10:00:00Z",
            last_message_at="2025-01-15T10:05:00Z",
            message_count=2
        )
        assert session.session_id == "test-123"
        
        # Test Message with MessageContent
        content = MessageContent(type="text", text="Hello world")
        message = Message(
            role="user",
            content=[content],
            timestamp="2025-01-15T10:00:00Z"
        )
        assert message.role == "user"
        assert len(message.content) == 1
        
        print("✅ Models can be instantiated correctly")
        return True
    except Exception as e:
        print(f"❌ Failed to instantiate models: {e}")
        traceback.print_exc()
        return False


def main():
    """Run all tests"""
    print("=" * 60)
    print("Testing Shared Sessions Module Import")
    print("=" * 60)
    
    results = []
    
    # Run all tests
    results.append(("Models Import", test_models_import()))
    results.append(("Metadata Import", test_metadata_import()))
    results.append(("Messages Import", test_messages_import()))
    results.append(("Module-Level Import", test_module_level_import()))
    results.append(("Circular Dependencies", test_no_circular_dependencies()))
    results.append(("Model Instantiation", test_model_instantiation()))
    
    # Print summary
    print("\n" + "=" * 60)
    print("Test Summary")
    print("=" * 60)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed! The shared sessions module can be imported without errors.")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Please review the errors above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
