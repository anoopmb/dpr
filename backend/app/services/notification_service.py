import uuid

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.email import send_email_safe
from app.core.exceptions import NotFoundError
from app.core.push import send_push_notification_safe
from app.models.notification import Notification
from app.models.user import User
from app.repositories.notification_repo import NotificationRepository
from app.repositories.push_subscription_repo import PushSubscriptionRepository
from app.services.organization_settings_service import OrganizationSettingsService


class NotificationService:
    def __init__(self, session: AsyncSession, background_tasks: BackgroundTasks | None = None) -> None:
        self.session = session
        self.background_tasks = background_tasks
        self.repo = NotificationRepository(session)
        self.settings_service = OrganizationSettingsService(session)

    async def notify(
        self,
        recipient_user_ids: list[uuid.UUID],
        *,
        type: str,
        title: str,
        message: str,
        link_url: str | None = None,
        project_id: uuid.UUID | None = None,
        related_entity_type: str | None = None,
        related_entity_id: uuid.UUID | None = None,
    ) -> list[Notification]:
        if not recipient_user_ids:
            return []

        notifications = [
            Notification(
                recipient_user_id=recipient_id,
                project_id=project_id,
                type=type,
                title=title,
                message=message,
                link_url=link_url,
                related_entity_type=related_entity_type,
                related_entity_id=related_entity_id,
            )
            for recipient_id in set(recipient_user_ids)
        ]
        for notification in notifications:
            self.repo.add(notification)
        await self.session.commit()
        for notification in notifications:
            await self.session.refresh(notification)

        org_settings = await self.settings_service.get()
        if org_settings.email_notifications_enabled:
            for notification in notifications:
                recipient = await self.session.get(User, notification.recipient_user_id)
                if recipient is None:
                    continue
                if self.background_tasks is not None:
                    self.background_tasks.add_task(send_email_safe, recipient.email, title, message)
                else:
                    await send_email_safe(recipient.email, title, message)

        push_repo = PushSubscriptionRepository(self.session)
        subscriptions = await push_repo.list_for_users(list(set(recipient_user_ids)))
        for sub in subscriptions:
            if self.background_tasks is not None:
                self.background_tasks.add_task(
                    send_push_notification_safe,
                    sub.endpoint, sub.p256dh, sub.auth, title, message, link_url,
                )
            else:
                send_push_notification_safe(sub.endpoint, sub.p256dh, sub.auth, title, message, link_url)

        return notifications

    async def list_for_user(self, user_id: uuid.UUID, limit: int = 50, offset: int = 0) -> list[Notification]:
        return await self.repo.list_for_user(user_id, limit=limit, offset=offset)

    async def unread_count_for_user(self, user_id: uuid.UUID) -> int:
        return await self.repo.unread_count_for_user(user_id)

    async def mark_read(self, notification_id: uuid.UUID, user_id: uuid.UUID) -> Notification:
        notification = await self.repo.mark_read(notification_id, user_id)
        if notification is None:
            raise NotFoundError(f"Notification {notification_id} not found.")
        await self.session.commit()
        await self.session.refresh(notification)
        return notification

    async def mark_all_read(self, user_id: uuid.UUID) -> None:
        await self.repo.mark_all_read(user_id)
        await self.session.commit()
