#!/usr/bin/env python3
"""
Test script to verify shared files module can be imported without errors.
"""

import sys
import os

# Add src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

def test_import_shared_files():
    """Test importing the shared files module."""
    print("Testing shared files module imports...")
    
    try:
        # Test importing the module
        from apis.shared import files
        print("✓ Successfully imported apis.shared.files")
        
        # Test importing models
        from apis.shared.files import (
            FileStatus,
            FileMetadata,
            UserFileQuota,
            PresignRequest,
            PresignResponse,
            CompleteUploadResponse,
            FileResponse,
            FileListResponse,
            QuotaResponse,
            QuotaExceededError,
            ALLOWED_MIME_TYPES,
            ALLOWED_EXTENSIONS,
            get_file_format,
            is_allowed_mime_type,
        )
        print("✓ Successfully imported all models")
        
        # Test importing repository
        from apis.shared.files import (
            FileUploadRepository,
            get_file_upload_repository,
        )
        print("✓ Successfully imported repository")
        
        # Test importing file resolver
        from apis.shared.files import (
            ResolvedFileContent,
            FileResolverError,
            FileResolver,
            get_file_resolver,
        )
        print("✓ Successfully imported file resolver")
        
        # Test that classes are accessible
        assert FileStatus.PENDING == "pending"
        assert FileStatus.READY == "ready"
        assert FileStatus.FAILED == "failed"
        print("✓ FileStatus enum works correctly")
        
        # Test helper functions
        assert is_allowed_mime_type("application/pdf") == True
        assert is_allowed_mime_type("application/invalid") == False
        print("✓ Helper functions work correctly")
        
        print("\n✅ All imports successful! Shared files module is working correctly.")
        return True
        
    except ImportError as e:
        print(f"\n❌ Import error: {e}")
        import traceback
        traceback.print_exc()
        return False
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback
        traceback.print_exc()
        return False

if __name__ == "__main__":
    success = test_import_shared_files()
    sys.exit(0 if success else 1)
