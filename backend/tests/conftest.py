"""Pytest configuration for test suite."""

import os
import sys
from pathlib import Path

# Ensure AWS region is set so that module-level boto3 calls don't fail
# during import (e.g. agents.main_agent.quota -> boto3.resource('dynamodb'))
os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")

# Add backend/src to Python path for imports
# This file is in backend/tests/, so we need to go up one level to backend/
BACKEND_DIR = Path(__file__).parent.parent
SRC_DIR = BACKEND_DIR / "src"

if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

