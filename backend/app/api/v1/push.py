import uuid

from fastapi import APIRouter, status
from pydantic import BaseModel

from app.api.deps import CurrentUserDep, SessionDep
from app.core.config import settings
from app.models.push_subscription import PushSubscription
from app.repositories.push_subscription_repo import PushSubscriptionRepository

router = APIRouter(prefix="/push", tags=["push"])


class PushSubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


class VapidPublicKeyRead(BaseModel):
    vapid_public_key: str | None


@router.get("/vapid-public-key", response_model=VapidPublicKeyRead)
async def get_vapid_public_key(_: CurrentUserDep) -> VapidPublicKeyRead:
    return VapidPublicKeyRead(vapid_public_key=settings.vapid_public_key)


@router.post("/subscribe", status_code=status.HTTP_201_CREATED)
async def subscribe(
    data: PushSubscribeRequest, session: SessionDep, current_user: CurrentUserDep
) -> dict[str, str]:
    repo = PushSubscriptionRepository(session)
    await repo.delete_by_endpoint(uuid.UUID(current_user.id), data.endpoint)
    sub = PushSubscription(
        user_id=uuid.UUID(current_user.id),
        endpoint=data.endpoint,
        p256dh=data.p256dh,
        auth=data.auth,
    )
    repo.add(sub)
    await session.commit()
    return {"status": "subscribed"}


@router.delete("/subscribe", status_code=status.HTTP_200_OK)
async def unsubscribe(
    data: PushSubscribeRequest, session: SessionDep, current_user: CurrentUserDep
) -> dict[str, str]:
    repo = PushSubscriptionRepository(session)
    await repo.delete_by_endpoint(uuid.UUID(current_user.id), data.endpoint)
    await session.commit()
    return {"status": "unsubscribed"}
