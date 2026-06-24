import uuid

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.material import MaterialIndent, MaterialIndentItem
from app.repositories.base import BaseRepository


class MaterialIndentRepository(BaseRepository[MaterialIndent]):
    model = MaterialIndent

    async def get_with_items(self, indent_id: uuid.UUID) -> MaterialIndent | None:
        result = await self.session.execute(
            select(MaterialIndent).options(selectinload(MaterialIndent.items)).where(MaterialIndent.id == indent_id)
        )
        return result.scalar_one_or_none()

    async def list_for_project(self, project_id: uuid.UUID) -> list[MaterialIndent]:
        result = await self.session.execute(
            select(MaterialIndent)
            .options(selectinload(MaterialIndent.items))
            .where(MaterialIndent.requesting_project_id == project_id)
        )
        return list(result.scalars().all())


class MaterialIndentItemRepository(BaseRepository[MaterialIndentItem]):
    model = MaterialIndentItem
