"""RAG service for assistant knowledge base search and prompt augmentation

This service handles searching the vector store for assistant-specific
knowledge and augmenting user prompts with retrieved context.
"""

import logging
import os
from typing import Any, Dict, List, Optional

import boto3
from botocore.exceptions import ClientError

from apis.app_api.documents.ingestion.embeddings.bedrock_embeddings import search_assistant_knowledgebase

logger = logging.getLogger(__name__)

# S3 client for presigned URL generation
_s3_client: boto3.client = None


def _get_s3_client() -> boto3.client:
    """Get or create S3 client singleton"""
    global _s3_client
    if _s3_client is None:
        _s3_client = boto3.client('s3', region_name=os.environ.get('AWS_REGION', 'us-west-2'))
    return _s3_client


def _generate_presigned_url(s3_key: str, expiration: int = 3600) -> Optional[str]:
    """
    Generate a presigned URL for an S3 object.

    Args:
        s3_key: The S3 object key
        expiration: URL expiration time in seconds (default: 1 hour)

    Returns:
        Presigned URL string or None if generation fails
    """
    if not s3_key:
        return None

    bucket_name = os.environ.get('ASSISTANTS_DOCUMENTS_BUCKET_NAME')
    if not bucket_name:
        logger.warning("ASSISTANTS_DOCUMENTS_BUCKET_NAME not configured, cannot generate presigned URL")
        return None

    try:
        s3_client = _get_s3_client()
        url = s3_client.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket_name, 'Key': s3_key},
            ExpiresIn=expiration
        )
        return url
    except ClientError as e:
        logger.error(f"Failed to generate presigned URL for {s3_key}: {e}")
        return None


async def search_assistant_knowledgebase_with_formatting(assistant_id: str, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    """
    Search assistant knowledge base and return formatted results

    Args:
        assistant_id: Assistant identifier to filter vectors
        query: User query text
        top_k: Number of top results to return (default: 5)

    Returns:
        List of dictionaries containing:
        - text: Chunk text content
        - distance: Similarity distance (lower = more similar)
        - metadata: Original metadata from vector store
        - key: Vector key/ID
    """
    try:
        # Call the bedrock_embeddings search function
        response = await search_assistant_knowledgebase(assistant_id, query)

        # Extract vectors from response
        vectors = response.get("vectors", [])

        if not vectors:
            logger.info(f"No vectors found for assistant {assistant_id} with query: {query[:50]}...")
            return []

        # Format results with presigned URLs
        formatted_results = []
        for vector in vectors[:top_k]:
            metadata = vector.get("metadata", {})
            s3_key = metadata.get("s3_key", "")

            # Generate presigned URL for the source document
            s3_url = _generate_presigned_url(s3_key) if s3_key else None

            formatted_results.append(
                {
                    "text": metadata.get("text", ""),
                    "distance": vector.get("distance"),
                    "s3_url": s3_url,  # Presigned URL (safe to expose to frontend)
                    "metadata": metadata,
                    "key": vector.get("key", ""),
                }
            )

        logger.info(f"Found {len(formatted_results)} relevant chunks for assistant {assistant_id}")
        return formatted_results

    except Exception as e:
        logger.error(f"Error searching knowledge base for assistant {assistant_id}: {e}", exc_info=True)
        # Return empty list on error (graceful degradation)
        return []


def augment_prompt_with_context(user_message: str, context_chunks: List[Dict[str, Any]], max_context_length: int = 2000) -> str:
    """
    Augment user message with retrieved context chunks

    The context is prepended to the user message with clear delimiters.
    This allows the LLM to use the retrieved knowledge when generating responses.

    Args:
        user_message: Original user message
        context_chunks: List of context chunks from vector search
        max_context_length: Maximum total length of context to include (chars)

    Returns:
        Augmented message string with context prepended
    """
    if not context_chunks:
        # No context available, return original message
        return user_message

    # Build context section
    context_parts = []
    total_length = 0

    for i, chunk in enumerate(context_chunks, 1):
        chunk_text = chunk.get("text", "").strip()
        if not chunk_text:
            continue

        # Check if adding this chunk would exceed max length
        chunk_with_header = f"[Context {i}]\n{chunk_text}\n"
        if total_length + len(chunk_with_header) > max_context_length:
            # Truncate this chunk if needed
            remaining = max_context_length - total_length - len(f"[Context {i}]\n\n")
            if remaining > 0:
                chunk_text = chunk_text[:remaining] + "..."
                context_parts.append(f"[Context {i}]\n{chunk_text}\n")
            break

        context_parts.append(chunk_with_header)
        total_length += len(chunk_with_header)

    if not context_parts:
        # No valid context chunks, return original message
        return user_message

    # Combine context and user message
    context_section = "\n".join(context_parts)
    augmented_message = f"""The following context is retrieved from the assistant's knowledge base. Use this information to answer the user's question accurately and comprehensively.

{context_section}
---
User Question: {user_message}"""

    return augmented_message
