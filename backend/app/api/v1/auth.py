import uuid

from fastapi import APIRouter, Request, Response
from jose.exceptions import JWTError

from app.api.deps import CurrentUserDep, SessionDep
from app.core.config import settings
from app.core.exceptions import AuthenticationError
from app.core.security import create_refresh_token, decode_token
from app.core.session import set_session_cookies
from app.repositories.user_repo import UserRepository
from app.schemas.auth import LoginRequest, SessionUser
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])

_REFRESH_COOKIE_PATH = "/api/v1/auth"


def _set_refresh_cookie(response: Response, user_id: str) -> None:
    refresh_token = create_refresh_token(subject=user_id)
    response.set_cookie(
        "refresh_token",
        refresh_token,
        max_age=settings.refresh_token_expire_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path=_REFRESH_COOKIE_PATH,
    )


def _clear_session_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("csrf_token", path="/")
    response.delete_cookie("refresh_token", path=_REFRESH_COOKIE_PATH)


@router.post("/login", response_model=SessionUser)
async def login(data: LoginRequest, response: Response, session: SessionDep) -> SessionUser:
    user = await AuthService(session).authenticate(data.login_id, data.password)
    set_session_cookies(response, user)
    _set_refresh_cookie(response, str(user.id))
    return SessionUser.model_validate(user)


@router.post("/refresh", response_model=SessionUser)
async def refresh(request: Request, response: Response, session: SessionDep) -> SessionUser:
    token = request.cookies.get("refresh_token")
    if not token:
        raise AuthenticationError("Missing refresh token.")

    try:
        payload = decode_token(token)
    except JWTError as exc:
        raise AuthenticationError("Invalid or expired refresh token.") from exc

    if payload.get("type") != "refresh":
        raise AuthenticationError("Token is not a refresh token.")

    user = await UserRepository(session).get(uuid.UUID(payload["sub"]))
    if user is None or not user.is_active:
        raise AuthenticationError("User account is no longer valid.")

    set_session_cookies(response, user)
    return SessionUser.model_validate(user)


@router.post("/logout", status_code=204)
async def logout(response: Response) -> None:
    _clear_session_cookies(response)


@router.get("/me", response_model=SessionUser)
async def me(current_user: CurrentUserDep) -> SessionUser:
    return SessionUser(
        id=uuid.UUID(current_user.id),
        login_id=current_user.login_id,
        full_name=current_user.full_name,
        email=current_user.email,
        photo_url=current_user.photo_url,
        role=current_user.role,
    )
