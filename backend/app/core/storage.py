"""Object storage for uploaded photos (DPR issues, measurement evidence,
attendance check-ins, material receipts).

Two backends, selected via STORAGE_BACKEND in settings:
- "s3" (default): S3/MinIO-compatible bucket.
- "local": writes under settings.local_upload_dir and serves it back via
  the /uploads static mount in app.main — for local dev without a MinIO
  server running.
"""

import shutil
import uuid
from pathlib import Path
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


def _upload_to_s3(fileobj: BinaryIO, key: str, content_type: str | None) -> str:
    client = get_s3_client()
    extra_args = {"ContentType": content_type} if content_type else {}
    client.upload_fileobj(fileobj, settings.s3_bucket, key, ExtraArgs=extra_args)
    return f"{settings.s3_endpoint_url}/{settings.s3_bucket}/{key}"


def _upload_to_local(fileobj: BinaryIO, key: str) -> str:
    dest = Path(settings.local_upload_dir) / key
    dest.parent.mkdir(parents=True, exist_ok=True)
    with open(dest, "wb") as out:
        shutil.copyfileobj(fileobj, out)
    return f"{settings.public_base_url}/uploads/{key}"


def upload_fileobj(fileobj: BinaryIO, prefix: str, filename: str, content_type: str | None) -> str:
    """Uploads fileobj under a random key inside prefix, returning the
    object's URL, using whichever backend is configured."""
    key = build_object_key(prefix, filename)
    if settings.storage_backend == "local":
        return _upload_to_local(fileobj, key)
    return _upload_to_s3(fileobj, key, content_type)
