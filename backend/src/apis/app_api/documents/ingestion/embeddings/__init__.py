"""Ingestion embedding utilities

Token validation and chunk splitting for the document ingestion pipeline.
Core embedding/vector operations are in apis.shared.embeddings.
"""

from .bedrock_embeddings import (
    validate_and_split_chunks,
)

__all__ = [
    "validate_and_split_chunks",
]
