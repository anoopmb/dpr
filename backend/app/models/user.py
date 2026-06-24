from enum import StrEnum

from sqlalchemy import Boolean, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class UserRole(StrEnum):
    SITE_ENGINEER = "SITE_ENGINEER"
    PROJECT_MANAGER = "PROJECT_MANAGER"
    QUANTITY_SURVEYOR = "QUANTITY_SURVEYOR"
    STORE_KEEPER = "STORE_KEEPER"
    ADMIN = "ADMIN"


class User(TimestampedBase):
    __tablename__ = "users"

    login_id: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    phone: Mapped[str | None] = mapped_column(String(20), unique=True)
    photo_url: Mapped[str | None] = mapped_column(String(500))
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(SAEnum(UserRole, name="user_role"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
