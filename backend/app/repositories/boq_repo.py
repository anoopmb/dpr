import uuid

from sqlalchemy import select

from app.models.boq import BoqItem, BoqSection
from app.repositories.base import BaseRepository


class BoqSectionRepository(BaseRepository[BoqSection]):
    model = BoqSection

    async def list_for_project(self, project_id: uuid.UUID) -> list[BoqSection]:
        result = await self.session.execute(
            select(BoqSection)
            .where(BoqSection.project_id == project_id)
            .order_by(BoqSection.sort_order, BoqSection.section_no)
        )
        return list(result.scalars().all())


class BoqRepository(BaseRepository[BoqItem]):
    model = BoqItem

    async def list_for_project(self, project_id: uuid.UUID) -> list[BoqItem]:
        result = await self.session.execute(
            select(BoqItem).where(BoqItem.project_id == project_id).order_by(BoqItem.item_no)
        )
        return list(result.scalars().all())
