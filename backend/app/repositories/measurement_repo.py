import uuid

from sqlalchemy import select

from app.models.measurement import Measurement
from app.repositories.base import BaseRepository


class MeasurementRepository(BaseRepository[Measurement]):
    model = Measurement

    async def list_for_project(self, project_id: uuid.UUID) -> list[Measurement]:
        result = await self.session.execute(
            select(Measurement).where(Measurement.project_id == project_id)
        )
        return list(result.scalars().all())
