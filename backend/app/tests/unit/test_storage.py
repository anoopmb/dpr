from io import BytesIO
from unittest.mock import MagicMock, patch

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
    with patch("app.core.storage.get_s3_client", return_value=fake_client):
        url = upload_fileobj(BytesIO(b"data"), "measurements", "photo.png", "image/png")

    fake_client.upload_fileobj.assert_called_once()
    args, kwargs = fake_client.upload_fileobj.call_args
    assert args[1] is not None  # bucket name passed through
    assert kwargs["ExtraArgs"] == {"ContentType": "image/png"}
    assert "measurements/" in url


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
