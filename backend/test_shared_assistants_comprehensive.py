#!/usr/bin/env python3
"""Comprehensive test for shared assistants module"""

import sys
from pathlib import Path

# Add src to path
src_path = Path(__file__).parent / "src"
sys.path.insert(0, str(src_path))

def test_module_structure():
    """Test the module structure and exports"""
    print("Testing shared assistants module structure...")
    
    try:
        import apis.shared.assistants as assistants_module
        
        # Check __all__ is defined
        assert hasattr(assistants_module, '__all__'), "Module missing __all__"
        print(f"  ✓ Module has __all__ with {len(assistants_module.__all__)} exports")
        
        # Check all exported items are actually available
        missing = []
        for name in assistants_module.__all__:
            if not hasattr(assistants_module, name):
                missing.append(name)
        
        if missing:
            print(f"  ❌ Missing exports: {missing}")
            return False
        
        print(f"  ✓ All {len(assistants_module.__all__)} exports are available")
        
        # Check submodules exist
        from apis.shared.assistants import models, service, rag_service
        print("  ✓ All submodules (models, service, rag_service) can be imported")
        
        # Check models
        model_classes = [
            'Assistant',
            'AssistantResponse',
            'AssistantsListResponse',
            'AssistantTestChatRequest',
            'CreateAssistantDraftRequest',
            'CreateAssistantRequest',
            'ShareAssistantRequest',
            'UnshareAssistantRequest',
            'AssistantSharesResponse',
            'UpdateAssistantRequest',
        ]
        
        for model_name in model_classes:
            assert hasattr(models, model_name), f"Missing model: {model_name}"
        print(f"  ✓ All {len(model_classes)} model classes exist")
        
        # Check service functions
        service_functions = [
            'archive_assistant',
            'assistant_exists',
            'check_share_access',
            'create_assistant',
            'create_assistant_draft',
            'delete_assistant',
            'get_assistant',
            'get_assistant_with_access_check',
            'list_assistant_shares',
            'list_shared_with_user',
            'list_user_assistants',
            'mark_share_as_interacted',
            'share_assistant',
            'unshare_assistant',
            'update_assistant',
        ]
        
        for func_name in service_functions:
            assert hasattr(service, func_name), f"Missing service function: {func_name}"
            assert callable(getattr(service, func_name)), f"Not callable: {func_name}"
        print(f"  ✓ All {len(service_functions)} service functions exist and are callable")
        
        # Check RAG service functions
        rag_functions = [
            'augment_prompt_with_context',
            'search_assistant_knowledgebase_with_formatting',
        ]
        
        for func_name in rag_functions:
            assert hasattr(rag_service, func_name), f"Missing RAG function: {func_name}"
            assert callable(getattr(rag_service, func_name)), f"Not callable: {func_name}"
        print(f"  ✓ All {len(rag_functions)} RAG service functions exist and are callable")
        
        print("\n✅ Module structure verification passed!")
        return True
        
    except AssertionError as e:
        print(f"\n❌ Assertion failed: {e}")
        return False
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_no_circular_imports():
    """Test that there are no circular import issues"""
    print("\nTesting for circular imports...")
    
    try:
        # Try importing in different orders
        print("  ✓ Testing import order 1: module -> models -> service -> rag_service")
        import apis.shared.assistants
        from apis.shared.assistants import models
        from apis.shared.assistants import service
        from apis.shared.assistants import rag_service
        
        print("  ✓ Testing import order 2: service -> models -> rag_service")
        from apis.shared.assistants import service as s
        from apis.shared.assistants import models as m
        from apis.shared.assistants import rag_service as r
        
        print("  ✓ Testing import order 3: individual imports")
        from apis.shared.assistants import Assistant, create_assistant, augment_prompt_with_context
        
        print("\n✅ No circular import issues detected!")
        return True
        
    except ImportError as e:
        print(f"\n❌ Circular import detected: {e}")
        import traceback
        traceback.print_exc()
        return False

def test_model_instantiation():
    """Test that models can be instantiated"""
    print("\nTesting model instantiation...")
    
    try:
        from apis.shared.assistants import Assistant, CreateAssistantRequest
        
        # Test Assistant model
        assistant = Assistant(
            assistant_id="ast-test123",
            owner_id="user-123",
            owner_name="Test User",
            name="Test Assistant",
            description="Test description",
            instructions="Test instructions",
            vector_index_id="test-index",
            visibility="PRIVATE",
            tags=["test"],
            usage_count=0,
            created_at="2024-01-01T00:00:00Z",
            updated_at="2024-01-01T00:00:00Z",
            status="COMPLETE",
        )
        print(f"  ✓ Created Assistant: {assistant.name}")
        
        # Test CreateAssistantRequest model
        request = CreateAssistantRequest(
            name="New Assistant",
            description="New description",
            instructions="New instructions",
            visibility="PRIVATE",
            tags=["new"],
        )
        print(f"  ✓ Created CreateAssistantRequest: {request.name}")
        
        print("\n✅ Model instantiation successful!")
        return True
        
    except Exception as e:
        print(f"\n❌ Model instantiation failed: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    results = []
    
    results.append(test_module_structure())
    results.append(test_no_circular_imports())
    results.append(test_model_instantiation())
    
    print("\n" + "="*60)
    if all(results):
        print("✅ ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print("❌ SOME TESTS FAILED")
        sys.exit(1)
