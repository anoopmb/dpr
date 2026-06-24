import uuid

from sqlalchemy import select

from app.models.project_assignment import ProjectAssignment
from app.repositories.base import BaseRepository


class ProjectAssignmentRepository(BaseRepository[ProjectAssignment]):
    model = ProjectAssignment

    async def list_for_project(self, project_id: uuid.UUID) -> list[ProjectAssignment]:
        result = await self.session.execute(
            select(ProjectAssignment).where(ProjectAssignment.project_id == project_id)
        )
        return list(result.scalars().all())

    async def list_for_project_and_role(self, project_id: uuid.UUID, role: str) -> list[ProjectAssignment]:
        result = await self.session.execute(
            select(ProjectAssignment).where(
                ProjectAssignment.project_id == project_id, ProjectAssignment.role == role
            )
        )
        return list(result.scalars().all())

    async def get_by_project_user_role(
        self, project_id: uuid.UUID, user_id: uuid.UUID, role: str
    ) -> ProjectAssignment | None:
        result = await self.session.execute(
            select(ProjectAssignment).where(
                ProjectAssignment.project_id == project_id,
                ProjectAssignment.user_id == user_id,
                ProjectAssignment.role == role,
            )
        )
        return result.scalar_one_or_none()
