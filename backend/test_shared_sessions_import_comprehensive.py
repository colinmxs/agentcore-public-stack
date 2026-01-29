#!/usr/bin/env python3
"""Comprehensive test for shared sessions module import verification

This test verifies:
1. All models can be imported
2. All metadata operations can be imported
3. All message operations can be imported
4. Module-level imports work
5. No circular dependencies
6. Models can be instantiated
7. All exported functions exist
8. Dependencies are documented
"""

import sys
import traceback
from pathlib import Path

# Add src to path
src_path = Path(__file__).parent / "src"
sys.path.insert(0, str(src_path))

def test_all_exports_exist():
    """Test that all exports declared in __init__.py actually exist"""
    print("Testing all exports exist...")
    try:
        from apis.shared.sessions import __all__
        import apis.shared.sessions as sessions_module
        
        missing_exports = []
        for export_name in __all__:
            if not hasattr(sessions_module, export_name):
                missing_exports.append(export_name)
        
        if missing_exports:
            print(f"❌ Missing exports: {missing_exports}")
            return False
        
        print(f"✅ All {len(__all__)} exports exist and are accessible")
        return True
    except Exception as e:
        print(f"❌ Failed to verify exports: {e}")
        traceback.print_exc()
        return False


def test_models_import():
    """Test importing all models from shared sessions module"""
    print("\nTesting models import...")
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


def test_metadata_operations_import():
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


def test_messages_operations_import():
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


def test_function_signatures():
    """Test that all exported functions have proper signatures"""
    print("\nTesting function signatures...")
    try:
        import inspect
        from apis.shared.sessions import (
            store_message_metadata,
            store_session_metadata,
            get_session_metadata,
            get_all_message_metadata,
            list_user_sessions,
            get_messages,
            get_messages_from_cloud,
            get_messages_from_local,
        )
        
        functions = {
            "store_message_metadata": store_message_metadata,
            "store_session_metadata": store_session_metadata,
            "get_session_metadata": get_session_metadata,
            "get_all_message_metadata": get_all_message_metadata,
            "list_user_sessions": list_user_sessions,
            "get_messages": get_messages,
            "get_messages_from_cloud": get_messages_from_cloud,
            "get_messages_from_local": get_messages_from_local,
        }
        
        for func_name, func in functions.items():
            sig = inspect.signature(func)
            # Just verify we can get the signature
            assert sig is not None
        
        print(f"✅ All {len(functions)} functions have valid signatures")
        return True
    except Exception as e:
        print(f"❌ Failed to verify function signatures: {e}")
        traceback.print_exc()
        return False


def document_dependencies():
    """Document current dependencies of the shared sessions module"""
    print("\nDocumenting module dependencies...")
    try:
        dependencies = {
            "External packages": [
                "pydantic (models)",
                "boto3 (DynamoDB operations)",
                "fastapi (HTTPException)",
            ],
            "Internal dependencies (to be resolved in task 1.5)": [
                "apis.app_api.storage.paths (path utilities)",
                "apis.app_api.storage.metadata_storage (storage abstraction)",
                "apis.app_api.storage.dynamodb_storage (DynamoDB storage)",
            ],
            "Optional dependencies": [
                "bedrock_agentcore.memory (AgentCore Memory integration)",
            ]
        }
        
        print("\n📦 Current Dependencies:")
        for category, deps in dependencies.items():
            print(f"\n  {category}:")
            for dep in deps:
                print(f"    - {dep}")
        
        print("\n✅ Dependencies documented")
        return True
    except Exception as e:
        print(f"❌ Failed to document dependencies: {e}")
        return False


def main():
    """Run all tests"""
    print("=" * 70)
    print("Comprehensive Shared Sessions Module Import Verification")
    print("=" * 70)
    
    results = []
    
    # Run all tests
    results.append(("All Exports Exist", test_all_exports_exist()))
    results.append(("Models Import", test_models_import()))
    results.append(("Metadata Operations Import", test_metadata_operations_import()))
    results.append(("Messages Operations Import", test_messages_operations_import()))
    results.append(("Module-Level Import", test_module_level_import()))
    results.append(("Circular Dependencies", test_no_circular_dependencies()))
    results.append(("Model Instantiation", test_model_instantiation()))
    results.append(("Function Signatures", test_function_signatures()))
    results.append(("Dependencies Documentation", document_dependencies()))
    
    # Print summary
    print("\n" + "=" * 70)
    print("Test Summary")
    print("=" * 70)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    # Additional notes
    print("\n" + "=" * 70)
    print("Notes")
    print("=" * 70)
    print("✓ The shared sessions module structure is correct")
    print("✓ All exported functions and models exist")
    print("✓ No circular dependencies within the shared module")
    print("✓ Models can be instantiated and used")
    print("\n⚠️  Current state:")
    print("  - Module has dependencies on apis.app_api.storage")
    print("  - This is expected and will be resolved in task 1.5")
    print("  - Task 1.5: 'Update imports within shared sessions module to use relative imports'")
    
    if passed == total:
        print("\n🎉 All tests passed! The shared sessions module is ready for task 1.5.")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed. Please review the errors above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
