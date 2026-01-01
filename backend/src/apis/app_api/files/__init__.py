"""
File Upload Module

Provides file upload functionality for conversations with S3 pre-signed URLs.
"""

from .models import (
    FileMetadata,
    FileStatus,
    UserFileQuota,
    PresignRequest,
    PresignResponse,
    CompleteUploadResponse,
    FileListResponse,
    QuotaResponse,
)
from .repository import FileUploadRepository, get_file_upload_repository
from .service import FileUploadService, get_file_upload_service

__all__ = [
    # Models
    "FileMetadata",
    "FileStatus",
    "UserFileQuota",
    "PresignRequest",
    "PresignResponse",
    "CompleteUploadResponse",
    "FileListResponse",
    "QuotaResponse",
    # Repository
    "FileUploadRepository",
    "get_file_upload_repository",
    # Service
    "FileUploadService",
    "get_file_upload_service",
]
