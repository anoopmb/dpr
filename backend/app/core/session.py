from fastapi import Response

from app.core.config import settings
from app.core.security import create_access_token, generate_csrf_token
from app.models.user import User


def set_session_cookies(response: Response, user: User) -> None:
    """Issues a fresh access_token/csrf_token pair carrying this user's
    current identity claims. Called at login/refresh, and again whenever
    full_name/photo_url/login_id change — without this, a profile edit
    would silently revert on next page load since /auth/me reads identity
    straight from the JWT, not the DB."""
    csrf_token = generate_csrf_token()
    access_token = create_access_token(
        subject=str(user.id),
        role=user.role,
        extra_claims={
            "csrf": csrf_token,
            "email": user.email,
            "full_name": user.full_name,
            "login_id": user.login_id,
            "photo_url": user.photo_url,
        },
    )

    response.set_cookie(
        "access_token",
        access_token,
        max_age=settings.access_token_expire_minutes * 60,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    response.set_cookie(
        "csrf_token",
        csrf_token,
        max_age=settings.access_token_expire_minutes * 60,
        httponly=False,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
