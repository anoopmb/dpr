import uuid
from typing import Generic, TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import TimestampedBase

ModelType = TypeVar("ModelType", bound=TimestampedBase)


class BaseRepository(Generic[ModelType]):
    model: type[ModelType]

    def __init__(self, session: AsyncSession, model: type[ModelType] | None = None) -> None:
        self.session = session
        if model is not None:
            self.model = model

    async def get(self, id_: uuid.UUID) -> ModelType | None:
        return await self.session.get(self.model, id_)

    async def list(self, limit: int = 50, offset: int = 0) -> list[ModelType]:
        result = await self.session.execute(select(self.model).limit(limit).offset(offset))
        return list(result.scalars().all())

    def add(self, instance: ModelType) -> ModelType:
        self.session.add(instance)
        return instance

    async def delete(self, instance: ModelType) -> None:
        await self.session.delete(instance)
