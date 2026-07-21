import uuid

from sqlalchemy import select

from app.models.project_photo import ProjectPhoto, PhotoEntityType
from app.repositories.base import BaseRepository


class ProjectPhotoRepository(BaseRepository[ProjectPhoto]):
    model = ProjectPhoto

    async def list_for_entity(self, entity_type: PhotoEntityType, entity_id: uuid.UUID) -> list[ProjectPhoto]:
        result = await self.session.execute(
            select(ProjectPhoto).where(
                ProjectPhoto.entity_type == entity_type, ProjectPhoto.entity_id == entity_id
            )
        )
        return list(result.scalars().all())

    async def list_for_entities(
        self, entity_type: PhotoEntityType, entity_ids: list[uuid.UUID]
    ) -> list[ProjectPhoto]:
        if not entity_ids:
            return []
        result = await self.session.execute(
            select(ProjectPhoto).where(
                ProjectPhoto.entity_type == entity_type,
                ProjectPhoto.entity_id.in_(entity_ids),
            )
        )
        return list(result.scalars().all())
