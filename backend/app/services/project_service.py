from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import DomainError, InUseError, NotFoundError
from app.models.audit import AuditAction
from app.models.project import Project
from app.models.project_completion_extension import ProjectCompletionExtension
from app.models.user import UserRole
from app.repositories.project_repo import ProjectRepository
from app.schemas.project import CompletionExtensionCreate, ProjectCreate, ProjectUpdate
from app.services.audit_service import AuditService, serialize_model
from app.services.project_assignment_service import ProjectAssignmentService

_FILTERED_ROLES = {UserRole.SITE_ENGINEER, UserRole.STORE_KEEPER, UserRole.QUANTITY_SURVEYOR}


class DuplicateTenderNoError(DomainError):
    error_code = "DUPLICATE_TENDER_NO"


class ProjectService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = ProjectRepository(session)
        self.audit = AuditService(session)

    async def create(self, data: ProjectCreate, actor_id: uuid.UUID) -> Project:
        existing = await self.repo.get_by_tender_no(data.tender_no)
        if existing is not None:
            raise DuplicateTenderNoError(f"Tender No '{data.tender_no}' already exists.")

        project = Project(**data.model_dump())
        self.repo.add(project)
        await self.session.flush()
        await self.audit.record(
            entity_type="PROJECT",
            entity_id=project.id,
            action=AuditAction.CREATE,
            actor_id=actor_id,
            after=serialize_model(project),
        )
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

    async def update(self, project_id: uuid.UUID, data: ProjectUpdate, actor_id: uuid.UUID) -> Project:
        project = await self.get(project_id)
        before = serialize_model(project)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(project, field, value)
        await self.session.flush()
        await self.audit.record(
            entity_type="PROJECT",
            entity_id=project.id,
            action=AuditAction.UPDATE,
            actor_id=actor_id,
            before=before,
            after=serialize_model(project),
        )
        await self.session.commit()
        await self.session.refresh(project)
        return project

    async def extend_completion(
        self, project_id: uuid.UUID, data: CompletionExtensionCreate, actor_id: uuid.UUID
    ) -> ProjectCompletionExtension:
        """Push the project's completion date forward and log the change.
        Only ever moves the date later — an extension earlier than (or equal
        to) the current completion is rejected."""
        project = await self.get(project_id)
        if data.new_completion_date <= project.completion_date:
            raise DomainError(
                "New completion date must be later than the current completion date "
                f"({project.completion_date.isoformat()})."
            )
        if data.new_completion_date <= project.start_date:
            raise DomainError("New completion date must be after the project start date.")

        before = serialize_model(project)
        extension = ProjectCompletionExtension(
            project_id=project.id,
            previous_completion_date=project.completion_date,
            new_completion_date=data.new_completion_date,
            reason=data.reason,
            extended_by=actor_id,
            extended_at=datetime.now(timezone.utc),
        )
        self.session.add(extension)
        project.completion_date = data.new_completion_date
        await self.session.flush()
        await self.audit.record(
            entity_type="PROJECT",
            entity_id=project.id,
            action=AuditAction.UPDATE,
            actor_id=actor_id,
            before=before,
            after=serialize_model(project),
        )
        await self.session.commit()
        await self.session.refresh(extension)
        return extension

    async def list_completion_extensions(self, project_id: uuid.UUID) -> list[ProjectCompletionExtension]:
        await self.get(project_id)  # 404 if the project doesn't exist
        result = await self.session.execute(
            select(ProjectCompletionExtension)
            .where(ProjectCompletionExtension.project_id == project_id)
            .order_by(ProjectCompletionExtension.extended_at.desc())
        )
        return list(result.scalars().all())

    async def delete(self, project_id: uuid.UUID, actor_id: uuid.UUID) -> None:
        project = await self.get(project_id)

        dep_tables = [
            "boq_items",
            "dpr_headers",
            "measurements",
            "attendance_records",
            "workers",
            "expenses",
            "running_bills",
            "material_indents",
            "stock_locations",
            "project_assignments",
        ]
        for table in dep_tables:
            result = await self.session.execute(
                text(f"SELECT COUNT(*) FROM {table} WHERE project_id = :pid"),
                {"pid": project_id},
            )
            count = result.scalar()
            if count and count > 0:
                raise InUseError(
                    f"Cannot delete project — it has existing {table.replace('_', ' ')}."
                )

        before = serialize_model(project)
        await self.session.delete(project)
        await self.audit.record(
            entity_type="PROJECT",
            entity_id=project_id,
            action=AuditAction.DELETE,
            actor_id=actor_id,
            before=before,
        )
        await self.session.commit()
