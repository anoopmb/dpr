"""S3/MinIO-compatible object storage for uploaded photos (DPR issues,
measurement evidence, attendance check-ins, material receipts).

No local-filesystem fallback — the architecture decision is S3-compatible
storage; if no bucket is reachable, uploads fail loudly rather than
silently writing to disk and drifting from the documented design.
"""

import uuid
from typing import BinaryIO

import boto3
from botocore.client import Config as BotoConfig

from app.core.config import settings

ALLOWED_UPLOAD_PREFIXES = frozenset(
    {"dpr-issues", "measurements", "attendance", "material-receipts", "expenses", "company-logo", "user-photos"}
)


def get_s3_client():
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint_url,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=BotoConfig(signature_version="s3v4"),
    )


def build_object_key(prefix: str, filename: str) -> str:
    extension = filename.rsplit(".", 1)[-1].lower() if "." in filename else "bin"
    return f"{prefix}/{uuid.uuid4()}.{extension}"


def upload_fileobj(fileobj: BinaryIO, prefix: str, filename: str, content_type: str | None) -> str:
    """Uploads fileobj to the configured bucket under a random key inside
    prefix, returning the object's URL."""
    client = get_s3_client()
    key = build_object_key(prefix, filename)
    extra_args = {"ContentType": content_type} if content_type else {}
    client.upload_fileobj(fileobj, settings.s3_bucket, key, ExtraArgs=extra_args)
    return f"{settings.s3_endpoint_url}/{settings.s3_bucket}/{key}"
