#!/usr/bin/env python3
"""Test script to verify shared assistants module imports correctly"""

import sys
from pathlib import Path

# Add src to path
src_path = Path(__file__).parent / "src"
sys.path.insert(0, str(src_path))

def test_imports():
    """Test that all shared assistants module exports can be imported"""
    print("Testing shared assistants module imports...")
    
    try:
        # Test importing the module
        print("  ✓ Importing apis.shared.assistants...")
        import apis.shared.assistants
        
        # Test importing models
        print("  ✓ Importing models...")
        from apis.shared.assistants import (
            Assistant,
            AssistantResponse,
            AssistantsListResponse,
            AssistantTestChatRequest,
            CreateAssistantDraftRequest,
            CreateAssistantRequest,
            ShareAssistantRequest,
            UnshareAssistantRequest,
            AssistantSharesResponse,
            UpdateAssistantRequest,
        )
        
        # Test importing service functions
        print("  ✓ Importing service functions...")
        from apis.shared.assistants import (
            archive_assistant,
            assistant_exists,
            check_share_access,
            create_assistant,
            create_assistant_draft,
            delete_assistant,
            get_assistant,
            get_assistant_with_access_check,
            list_assistant_shares,
            list_shared_with_user,
            list_user_assistants,
            mark_share_as_interacted,
            share_assistant,
            unshare_assistant,
            update_assistant,
        )
        
        # Test importing RAG service functions
        print("  ✓ Importing RAG service functions...")
        from apis.shared.assistants import (
            augment_prompt_with_context,
            search_assistant_knowledgebase_with_formatting,
        )
        
        print("\n✅ All imports successful!")
        print(f"   Module location: {apis.shared.assistants.__file__}")
        print(f"   Exported items: {len(apis.shared.assistants.__all__)}")
        return True
        
    except ImportError as e:
        print(f"\n❌ Import failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_imports()
    sys.exit(0 if success else 1)
