import uuid
from typing import Generic, TypeVar

from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import InUseError, NotFoundError
from app.models.base import TimestampedBase
from app.repositories.base import BaseRepository

ModelType = TypeVar("ModelType", bound=TimestampedBase)


class MasterDataService(Generic[ModelType]):
    """Generic CRUD for Tier-1 lookup tables (departments, UOM, work types,
    material/machinery/worker/expense categories, stock locations) — these
    are small, structurally similar reference tables with no business-rule
    validation beyond the schema/DB constraints already defined on the
    model, so one generic service avoids seven near-identical copies."""

    def __init__(self, session: AsyncSession, model: type[ModelType]) -> None:
        self.session = session
        self.repo: BaseRepository[ModelType] = BaseRepository(session, model=model)

    async def create(self, data: BaseModel) -> ModelType:
        instance = self.repo.model(**data.model_dump())
        self.repo.add(instance)
        await self.session.commit()
        await self.session.refresh(instance)
        return instance

    async def list(self, limit: int = 200, offset: int = 0) -> list[ModelType]:
        return await self.repo.list(limit=limit, offset=offset)

    async def get(self, id_: uuid.UUID) -> ModelType:
        instance = await self.repo.get(id_)
        if instance is None:
            raise NotFoundError(f"{self.repo.model.__name__} {id_} not found.")
        return instance

    async def update(self, id_: uuid.UUID, data: BaseModel) -> ModelType:
        instance = await self.get(id_)
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(instance, field, value)
        await self.session.commit()
        await self.session.refresh(instance)
        return instance

    async def delete(self, id_: uuid.UUID) -> None:
        instance = await self.get(id_)
        await self.session.delete(instance)
        try:
            await self.session.commit()
        except IntegrityError:
            await self.session.rollback()
            raise InUseError(
                "Cannot delete — this record is referenced by other data and cannot be removed."
            )
