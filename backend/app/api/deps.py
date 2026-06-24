import hmac
from collections.abc import Callable, Coroutine
from typing import Annotated, Any

from fastapi import Depends, Request
from jose.exceptions import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.exceptions import AuthenticationError, CsrfValidationError, PermissionDeniedError
from app.core.security import decode_token
from app.models.user import UserRole

SessionDep = Annotated[AsyncSession, Depends(get_session)]

_MUTATING_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


class CurrentUser:
    def __init__(
        self, id: str, role: UserRole, email: str, full_name: str, login_id: str, photo_url: str | None
    ) -> None:
        self.id = id
        self.role = role
        self.email = email
        self.full_name = full_name
        self.login_id = login_id
        self.photo_url = photo_url


async def get_current_user(request: Request) -> CurrentUser:
    """Reads the session from the httpOnly access_token cookie (never an
    Authorization header) and, for mutating methods, verifies the
    X-CSRF-Token request header against the csrf claim signed into that
    same cookie (double-submit pattern — no server-side CSRF store needed).
    """
    token = request.cookies.get("access_token")
    if not token:
        raise AuthenticationError("Missing session cookie.")

    try:
        payload = decode_token(token)
    except JWTError as exc:
        raise AuthenticationError("Invalid or expired session.") from exc

    if payload.get("type") != "access":
        raise AuthenticationError("Token is not an access token.")

    if request.method in _MUTATING_METHODS:
        csrf_header = request.headers.get("X-CSRF-Token")
        csrf_claim = payload.get("csrf")
        if not csrf_header or not csrf_claim or not hmac.compare_digest(csrf_header, csrf_claim):
            raise CsrfValidationError("Missing or invalid CSRF token.")

    return CurrentUser(
        id=payload["sub"],
        role=UserRole(payload["role"]),
        email=payload.get("email", ""),
        full_name=payload.get("full_name", ""),
        login_id=payload.get("login_id", ""),
        photo_url=payload.get("photo_url"),
    )


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


def require_role(*allowed_roles: UserRole) -> Callable[[CurrentUser], Coroutine[Any, Any, CurrentUser]]:
    async def _checker(user: CurrentUserDep) -> CurrentUser:
        if user.role != UserRole.ADMIN and user.role not in allowed_roles:
            raise PermissionDeniedError(
                f"Role {user.role} is not permitted to perform this action."
            )
        return user

    return _checker
