import uuid

from sqlalchemy import select

from app.models.worker import Worker
from app.repositories.base import BaseRepository


class WorkerRepository(BaseRepository[Worker]):
    model = Worker

    async def list_for_project(self, project_id: uuid.UUID) -> list[Worker]:
        result = await self.session.execute(select(Worker).where(Worker.project_id == project_id))
        return list(result.scalars().all())
