import pytest
from starlette.requests import Request

from app.api.deps import get_current_user
from app.core.exceptions import AuthenticationError, CsrfValidationError
from app.core.security import create_access_token


def make_request(method: str = "GET", cookies: dict[str, str] | None = None, headers: dict[str, str] | None = None) -> Request:
    raw_headers: list[tuple[bytes, bytes]] = []
    if cookies:
        cookie_header = "; ".join(f"{k}={v}" for k, v in cookies.items())
        raw_headers.append((b"cookie", cookie_header.encode()))
    for key, value in (headers or {}).items():
        raw_headers.append((key.lower().encode(), value.encode()))
    scope = {"type": "http", "method": method, "headers": raw_headers}
    return Request(scope)


def make_access_token(csrf: str = "expected-csrf-value") -> str:
    return create_access_token(
        subject="11111111-1111-1111-1111-111111111111",
        role="ADMIN",
        extra_claims={"csrf": csrf, "email": "a@example.com", "full_name": "A"},
    )


async def test_missing_cookie_raises_authentication_error():
    with pytest.raises(AuthenticationError):
        await get_current_user(make_request())


async def test_get_request_does_not_require_csrf():
    token = make_access_token()
    user = await get_current_user(make_request("GET", cookies={"access_token": token}))
    assert user.role == "ADMIN"


async def test_post_without_csrf_header_raises():
    token = make_access_token()
    with pytest.raises(CsrfValidationError):
        await get_current_user(make_request("POST", cookies={"access_token": token}))


async def test_post_with_mismatched_csrf_header_raises():
    token = make_access_token(csrf="expected-csrf-value")
    request = make_request(
        "POST",
        cookies={"access_token": token},
        headers={"X-CSRF-Token": "wrong-value"},
    )
    with pytest.raises(CsrfValidationError):
        await get_current_user(request)


async def test_post_with_matching_csrf_header_succeeds():
    token = make_access_token(csrf="expected-csrf-value")
    request = make_request(
        "POST",
        cookies={"access_token": token},
        headers={"X-CSRF-Token": "expected-csrf-value"},
    )
    user = await get_current_user(request)
    assert user.email == "a@example.com"
