import uuid

from sqlalchemy import func, select, update

from app.models.notification import Notification
from app.repositories.base import BaseRepository


class NotificationRepository(BaseRepository[Notification]):
    model = Notification

    async def list_for_user(self, user_id: uuid.UUID, limit: int = 50, offset: int = 0) -> list[Notification]:
        result = await self.session.execute(
            select(Notification)
            .where(Notification.recipient_user_id == user_id)
            .order_by(Notification.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def unread_count_for_user(self, user_id: uuid.UUID) -> int:
        result = await self.session.execute(
            select(func.count())
            .select_from(Notification)
            .where(Notification.recipient_user_id == user_id, Notification.is_read.is_(False))
        )
        return result.scalar_one()

    async def mark_read(self, notification_id: uuid.UUID, user_id: uuid.UUID) -> Notification | None:
        notification = await self.get(notification_id)
        if notification is None or notification.recipient_user_id != user_id:
            return None
        notification.is_read = True
        return notification

    async def mark_all_read(self, user_id: uuid.UUID) -> None:
        await self.session.execute(
            update(Notification)
            .where(Notification.recipient_user_id == user_id, Notification.is_read.is_(False))
            .values(is_read=True)
        )
