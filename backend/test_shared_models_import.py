#!/usr/bin/env python3
"""Test script to verify shared models module imports correctly."""

import sys
from pathlib import Path

# Add src to path
src_path = Path(__file__).parent / "src"
sys.path.insert(0, str(src_path))

def test_models_imports():
    """Test that all models can be imported from shared.models."""
    print("Testing shared models module imports...")
    
    # Test model imports
    from apis.shared.models import (
        ManagedModel,
        ManagedModelCreate,
        ManagedModelUpdate,
    )
    print("✅ Model classes imported successfully")
    
    # Test service function imports
    from apis.shared.models import (
        create_managed_model,
        get_managed_model,
        list_managed_models,
        list_all_managed_models,
        update_managed_model,
        delete_managed_model,
    )
    print("✅ Service functions imported successfully")
    
    # Verify classes are actually classes
    assert isinstance(ManagedModel, type), "ManagedModel should be a class"
    assert isinstance(ManagedModelCreate, type), "ManagedModelCreate should be a class"
    assert isinstance(ManagedModelUpdate, type), "ManagedModelUpdate should be a class"
    print("✅ Model classes are valid types")
    
    # Verify functions are callable
    assert callable(create_managed_model), "create_managed_model should be callable"
    assert callable(get_managed_model), "get_managed_model should be callable"
    assert callable(list_managed_models), "list_managed_models should be callable"
    assert callable(list_all_managed_models), "list_all_managed_models should be callable"
    assert callable(update_managed_model), "update_managed_model should be callable"
    assert callable(delete_managed_model), "delete_managed_model should be callable"
    print("✅ Service functions are callable")
    
    # Test direct module imports
    from apis.shared.models import models as models_module
    from apis.shared.models import managed_models as service_module
    print("✅ Direct module imports successful")
    
    # Verify module structure
    assert hasattr(models_module, 'ManagedModel'), "models module should have ManagedModel"
    assert hasattr(models_module, 'ManagedModelCreate'), "models module should have ManagedModelCreate"
    assert hasattr(models_module, 'ManagedModelUpdate'), "models module should have ManagedModelUpdate"
    print("✅ Models module structure verified")
    
    assert hasattr(service_module, 'create_managed_model'), "service module should have create_managed_model"
    assert hasattr(service_module, 'get_managed_model'), "service module should have get_managed_model"
    assert hasattr(service_module, 'list_managed_models'), "service module should have list_managed_models"
    assert hasattr(service_module, 'list_all_managed_models'), "service module should have list_all_managed_models"
    assert hasattr(service_module, 'update_managed_model'), "service module should have update_managed_model"
    assert hasattr(service_module, 'delete_managed_model'), "service module should have delete_managed_model"
    print("✅ Service module structure verified")
    
    print("\n🎉 All shared models module tests passed!")
    return True

if __name__ == "__main__":
    try:
        test_models_imports()
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
