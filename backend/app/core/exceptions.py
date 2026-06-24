from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse


class DomainError(Exception):
    """Base class for business-rule violations raised from app/domain."""

    error_code: str = "DOMAIN_ERROR"
    http_status: int = 422

    def __init__(self, message: str, field_errors: dict[str, str] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.field_errors = field_errors or {}


class NotFoundError(DomainError):
    error_code = "NOT_FOUND"
    http_status = status.HTTP_404_NOT_FOUND


class PermissionDeniedError(DomainError):
    error_code = "PERMISSION_DENIED"
    http_status = status.HTTP_403_FORBIDDEN


class InvalidStateTransitionError(DomainError):
    error_code = "INVALID_STATE_TRANSITION"
    http_status = status.HTTP_409_CONFLICT


class InUseError(DomainError):
    error_code = "ENTITY_IN_USE"
    http_status = status.HTTP_409_CONFLICT


class DuplicateError(DomainError):
    error_code = "DUPLICATE_ENTRY"
    http_status = status.HTTP_409_CONFLICT


class CsrfValidationError(DomainError):
    error_code = "CSRF_VALIDATION_FAILED"
    http_status = status.HTTP_403_FORBIDDEN


class AuthenticationError(DomainError):
    error_code = "AUTHENTICATION_FAILED"
    http_status = status.HTTP_401_UNAUTHORIZED


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def handle_domain_error(request: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(
            status_code=exc.http_status,
            content={
                "code": exc.error_code,
                "message": exc.message,
                "field_errors": exc.field_errors,
            },
        )
