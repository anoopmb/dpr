import uuid

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.push_subscription import PushSubscription


class PushSubscriptionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    def add(self, sub: PushSubscription) -> None:
        self.session.add(sub)

    async def list_for_user(self, user_id: uuid.UUID) -> list[PushSubscription]:
        result = await self.session.execute(
            select(PushSubscription).where(PushSubscription.user_id == user_id)
        )
        return list(result.scalars().all())

    async def list_for_users(self, user_ids: list[uuid.UUID]) -> list[PushSubscription]:
        if not user_ids:
            return []
        result = await self.session.execute(
            select(PushSubscription).where(PushSubscription.user_id.in_(user_ids))
        )
        return list(result.scalars().all())

    async def delete_by_endpoint(self, user_id: uuid.UUID, endpoint: str) -> None:
        await self.session.execute(
            delete(PushSubscription).where(
                PushSubscription.user_id == user_id,
                PushSubscription.endpoint == endpoint,
            )
        )
