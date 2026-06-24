import uuid

from fastapi import status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import DomainError, NotFoundError, PermissionDeniedError
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.repositories.user_repo import UserRepository
from app.schemas.user import ChangePasswordRequest, UserCreate, UserProfileUpdate, UserUpdate


class DuplicateLoginIdError(DomainError):
    error_code = "DUPLICATE_LOGIN_ID"


class DuplicateEmailError(DomainError):
    error_code = "DUPLICATE_EMAIL"


class IncorrectPasswordError(DomainError):
    error_code = "INCORRECT_PASSWORD"
    http_status = status.HTTP_403_FORBIDDEN


class UserService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = UserRepository(session)

    async def create(self, data: UserCreate) -> User:
        if await self.repo.get_by_login_id(data.login_id) is not None:
            raise DuplicateLoginIdError(f"User ID '{data.login_id}' is already taken.")
        if await self.repo.get_by_email(data.email) is not None:
            raise DuplicateEmailError(f"Email '{data.email}' is already registered.")

        user = User(
            login_id=data.login_id,
            full_name=data.full_name,
            email=data.email,
            phone=data.phone,
            hashed_password=hash_password(data.password),
            role=data.role,
            is_active=data.is_active,
        )
        self.repo.add(user)
        await self.session.commit()
        await self.session.refresh(user)
        return user

    async def list(self, limit: int = 200, offset: int = 0) -> list[User]:
        return await self.repo.list(limit=limit, offset=offset)

    async def get(self, user_id: uuid.UUID) -> User:
        user = await self.repo.get(user_id)
        if user is None:
            raise NotFoundError(f"User {user_id} not found.")
        return user

    async def update(self, user_id: uuid.UUID, data: UserUpdate) -> User:
        user = await self.get(user_id)
        updates = data.model_dump(exclude_unset=True)
        if "email" in updates and updates["email"] != user.email:
            if await self.repo.get_by_email(updates["email"]) is not None:
                raise DuplicateEmailError(f"Email '{updates['email']}' is already registered.")
        for field, value in updates.items():
            setattr(user, field, value)
        await self.session.commit()
        await self.session.refresh(user)
        return user

    async def update_profile(self, user_id: uuid.UUID, data: UserProfileUpdate) -> User:
        user = await self.get(user_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(user, field, value)
        await self.session.commit()
        await self.session.refresh(user)
        return user

    async def change_password(self, user_id: uuid.UUID, data: ChangePasswordRequest) -> None:
        user = await self.get(user_id)
        if not verify_password(data.current_password, user.hashed_password):
            raise IncorrectPasswordError("Current password is incorrect.")
        user.hashed_password = hash_password(data.new_password)
        await self.session.commit()

    async def deactivate(self, user_id: uuid.UUID, actor_id: uuid.UUID) -> User:
        if user_id == actor_id:
            raise PermissionDeniedError("You cannot deactivate your own account.")
        user = await self.get(user_id)
        user.is_active = False
        await self.session.commit()
        await self.session.refresh(user)
        return user
