import uuid

from fastapi import APIRouter

from app.api.deps import CurrentUserDep, SessionDep
from app.schemas.notification import NotificationListRead, NotificationRead
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=NotificationListRead)
async def list_notifications(
    session: SessionDep, current_user: CurrentUserDep, limit: int = 50, offset: int = 0
) -> NotificationListRead:
    service = NotificationService(session)
    user_id = uuid.UUID(current_user.id)
    items = await service.list_for_user(user_id, limit=limit, offset=offset)
    unread_count = await service.unread_count_for_user(user_id)
    return NotificationListRead(
        items=[NotificationRead.model_validate(n) for n in items], unread_count=unread_count
    )


@router.post("/{notification_id}/read", response_model=NotificationRead)
async def mark_notification_read(
    notification_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep
) -> NotificationRead:
    notification = await NotificationService(session).mark_read(notification_id, uuid.UUID(current_user.id))
    return NotificationRead.model_validate(notification)


@router.post("/read-all", status_code=204)
async def mark_all_notifications_read(session: SessionDep, current_user: CurrentUserDep) -> None:
    await NotificationService(session).mark_all_read(uuid.UUID(current_user.id))
