from sqlalchemy import select

from app.models.project import Project
from app.repositories.base import BaseRepository


class ProjectRepository(BaseRepository[Project]):
    model = Project

    async def get_by_tender_no(self, tender_no: str) -> Project | None:
        result = await self.session.execute(select(Project).where(Project.tender_no == tender_no))
        return result.scalar_one_or_none()
