import uuid

from pydantic import BaseModel, ConfigDict

from app.models.user import UserRole


class LoginRequest(BaseModel):
    login_id: str
    password: str


class SessionUser(BaseModel):
    """Lightweight session-identity shape returned by /auth/* — built from
    JWT claims for /me (no DB hit) or from the User row for login/refresh."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    login_id: str
    full_name: str
    email: str
    photo_url: str | None
    role: UserRole
