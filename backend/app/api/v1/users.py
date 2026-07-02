import uuid

from fastapi import APIRouter, Depends, Response, status

from app.api.deps import CurrentUserDep, SessionDep, require_role
from app.core.session import set_session_cookies
from app.models.user import UserRole
from app.schemas.activity import ActivityListRead
from app.schemas.user import (
    AdminResetPasswordRequest,
    ChangePasswordRequest,
    UserCreate,
    UserDirectoryEntry,
    UserProfileUpdate,
    UserRead,
    UserUpdate,
)
from app.services.activity_service import ActivityService
from app.services.user_service import UserService

router = APIRouter(prefix="/users", tags=["users"])


@router.post(
    "",
    response_model=UserRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)
async def create_user(data: UserCreate, session: SessionDep, current_user: CurrentUserDep) -> UserRead:
    user = await UserService(session).create(data, actor_id=uuid.UUID(current_user.id))
    return UserRead.model_validate(user)


@router.get("", response_model=list[UserRead], dependencies=[Depends(require_role(UserRole.ADMIN))])
async def list_users(session: SessionDep, limit: int = 200, offset: int = 0) -> list[UserRead]:
    users = await UserService(session).list(limit=limit, offset=offset)
    return [UserRead.model_validate(u) for u in users]


@router.get("/directory", response_model=list[UserDirectoryEntry])
async def list_user_directory(session: SessionDep, _: CurrentUserDep) -> list[UserDirectoryEntry]:
    users = await UserService(session).list(limit=1000, offset=0)
    return [UserDirectoryEntry.model_validate(u) for u in users]


@router.patch("/me", response_model=UserRead)
async def update_my_profile(
    data: UserProfileUpdate, session: SessionDep, current_user: CurrentUserDep, response: Response
) -> UserRead:
    user = await UserService(session).update_profile(uuid.UUID(current_user.id), data)
    set_session_cookies(response, user)
    return UserRead.model_validate(user)


@router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_my_password(
    data: ChangePasswordRequest, session: SessionDep, current_user: CurrentUserDep
) -> None:
    await UserService(session).change_password(uuid.UUID(current_user.id), data)


@router.get("/me/activity", response_model=ActivityListRead)
async def get_my_activity(session: SessionDep, current_user: CurrentUserDep) -> ActivityListRead:
    return await ActivityService(session).get_for_user(uuid.UUID(current_user.id))


@router.get("/{user_id}", response_model=UserRead, dependencies=[Depends(require_role(UserRole.ADMIN))])
async def get_user(user_id: uuid.UUID, session: SessionDep) -> UserRead:
    user = await UserService(session).get(user_id)
    return UserRead.model_validate(user)


@router.patch("/{user_id}", response_model=UserRead, dependencies=[Depends(require_role(UserRole.ADMIN))])
async def update_user(user_id: uuid.UUID, data: UserUpdate, session: SessionDep, current_user: CurrentUserDep) -> UserRead:
    user = await UserService(session).update(user_id, data, actor_id=uuid.UUID(current_user.id))
    return UserRead.model_validate(user)


@router.post(
    "/{user_id}/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)
async def reset_user_password(
    user_id: uuid.UUID, data: AdminResetPasswordRequest, session: SessionDep, current_user: CurrentUserDep
) -> None:
    await UserService(session).reset_password(user_id, data, actor_id=uuid.UUID(current_user.id))
