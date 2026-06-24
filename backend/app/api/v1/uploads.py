from fastapi import APIRouter, File, UploadFile

from app.api.deps import CurrentUserDep
from app.core.exceptions import DomainError
from app.core.storage import ALLOWED_UPLOAD_PREFIXES, upload_fileobj

router = APIRouter(prefix="/uploads", tags=["uploads"])


class InvalidUploadPrefixError(DomainError):
    error_code = "INVALID_UPLOAD_PREFIX"


@router.post("/{prefix}")
async def upload_photo(prefix: str, _: CurrentUserDep, file: UploadFile = File(...)) -> dict[str, str]:
    if prefix not in ALLOWED_UPLOAD_PREFIXES:
        raise InvalidUploadPrefixError(
            f"Unknown upload prefix '{prefix}'. Allowed: {sorted(ALLOWED_UPLOAD_PREFIXES)}"
        )

    url = upload_fileobj(file.file, prefix, file.filename or "upload.bin", file.content_type)
    return {"url": url}
