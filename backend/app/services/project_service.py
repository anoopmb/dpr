import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import DomainError, NotFoundError
from app.models.project import Project
from app.models.user import UserRole
from app.repositories.project_repo import ProjectRepository
from app.schemas.project import ProjectCreate, ProjectUpdate
from app.services.project_assignment_service import ProjectAssignmentService

# Operational field roles see only projects they're assigned to; ADMIN and
# PROJECT_MANAGER manage across the whole portfolio and keep the full list.
_FILTERED_ROLES = {UserRole.SITE_ENGINEER, UserRole.STORE_KEEPER, UserRole.QUANTITY_SURVEYOR}


class DuplicateTenderNoError(DomainError):
    error_code = "DUPLICATE_TENDER_NO"


class ProjectService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = ProjectRepository(session)

    async def create(self, data: ProjectCreate) -> Project:
        existing = await self.repo.get_by_tender_no(data.tender_no)
        if existing is not None:
            raise DuplicateTenderNoError(f"Tender No '{data.tender_no}' already exists.")

        project = Project(**data.model_dump())
        self.repo.add(project)
        await self.session.commit()
        await self.session.refresh(project)
        return project

    async def get(self, project_id: uuid.UUID) -> Project:
        project = await self.repo.get(project_id)
        if project is None:
            raise NotFoundError(f"Project {project_id} not found.")
        return project

    async def list(self, user_id: uuid.UUID, role: UserRole, limit: int = 50, offset: int = 0) -> list[Project]:
        if role not in _FILTERED_ROLES:
            return await self.repo.list(limit=limit, offset=offset)

        project_ids = await ProjectAssignmentService(self.session).list_project_ids_for_user(user_id, role)
        if not project_ids:
            return []
        return await self.repo.list_for_ids(project_ids, limit=limit, offset=offset)

    async def update(self, project_id: uuid.UUID, data: ProjectUpdate) -> Project:
        project = await self.get(project_id)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(project, field, value)
        await self.session.commit()
        await self.session.refresh(project)
        return project
