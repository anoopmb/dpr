import tempfile
from io import BytesIO
from unittest.mock import MagicMock, patch

from app.core.config import settings
from app.core.storage import ALLOWED_UPLOAD_PREFIXES, build_object_key, upload_fileobj


def test_build_object_key_uses_prefix_and_extension():
    key = build_object_key("dpr-issues", "site-photo.JPG")
    assert key.startswith("dpr-issues/")
    assert key.endswith(".jpg")


def test_build_object_key_defaults_extension_when_missing():
    key = build_object_key("attendance", "noextension")
    assert key.endswith(".bin")


def test_upload_fileobj_calls_s3_client_and_returns_url():
    fake_client = MagicMock()
    with patch.object(settings, "storage_backend", "s3"), patch(
        "app.core.storage.get_s3_client", return_value=fake_client
    ):
        url = upload_fileobj(BytesIO(b"data"), "measurements", "photo.png", "image/png")

    fake_client.upload_fileobj.assert_called_once()
    args, kwargs = fake_client.upload_fileobj.call_args
    assert args[1] is not None  # bucket name passed through
    assert kwargs["ExtraArgs"] == {"ContentType": "image/png"}
    assert "measurements/" in url


def test_upload_fileobj_writes_to_disk_for_local_backend():
    with tempfile.TemporaryDirectory() as tmp_dir:
        with patch.object(settings, "storage_backend", "local"), patch.object(
            settings, "local_upload_dir", tmp_dir
        ), patch.object(settings, "public_base_url", "http://localhost:8000"):
            url = upload_fileobj(BytesIO(b"data"), "measurements", "photo.png", "image/png")

        assert url.startswith("http://localhost:8000/uploads/measurements/")
        key = url.split("/uploads/", 1)[1]
        from pathlib import Path

        assert (Path(tmp_dir) / key).read_bytes() == b"data"


def test_allowed_upload_prefixes_cover_all_photo_capturing_screens():
    assert ALLOWED_UPLOAD_PREFIXES == {
        "dpr-issues",
        "measurements",
        "attendance",
        "material-receipts",
        "expenses",
        "company-logo",
        "user-photos",
    }
