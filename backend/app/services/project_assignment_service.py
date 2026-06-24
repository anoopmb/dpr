import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import DomainError, NotFoundError
from app.models.project import Project
from app.models.project_assignment import ProjectAssignment
from app.models.user import User, UserRole
from app.repositories.project_assignment_repo import ProjectAssignmentRepository

_LEGACY_FIELD_BY_ROLE = {
    UserRole.PROJECT_MANAGER: "project_manager_id",
    UserRole.SITE_ENGINEER: "site_engineer_id",
}


class RoleMismatchError(DomainError):
    error_code = "ROLE_MISMATCH"


class DuplicateAssignmentError(DomainError):
    error_code = "DUPLICATE_ASSIGNMENT"


class ProjectAssignmentService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = ProjectAssignmentRepository(session)

    async def _get_project(self, project_id: uuid.UUID) -> Project:
        project = await self.session.get(Project, project_id)
        if project is None:
            raise NotFoundError(f"Project {project_id} not found.")
        return project

    async def list_for_project(self, project_id: uuid.UUID) -> list[ProjectAssignment]:
        await self._get_project(project_id)
        return await self.repo.list_for_project(project_id)

    async def assign(self, project_id: uuid.UUID, user_id: uuid.UUID, role: UserRole) -> ProjectAssignment:
        await self._get_project(project_id)

        user = await self.session.get(User, user_id)
        if user is None:
            raise NotFoundError(f"User {user_id} not found.")
        if user.role != role:
            raise RoleMismatchError(f"User {user.full_name} does not have role {role}.")

        existing = await self.repo.get_by_project_user_role(project_id, user_id, role)
        if existing is not None:
            raise DuplicateAssignmentError("This user is already assigned to this role on this project.")

        assignment = ProjectAssignment(project_id=project_id, user_id=user_id, role=role)
        self.repo.add(assignment)
        await self.session.commit()
        await self.session.refresh(assignment)
        return assignment

    async def unassign(self, project_id: uuid.UUID, assignment_id: uuid.UUID) -> None:
        await self._get_project(project_id)
        assignment = await self.repo.get(assignment_id)
        if assignment is None or assignment.project_id != project_id:
            raise NotFoundError(f"Assignment {assignment_id} not found for this project.")
        await self.repo.delete(assignment)
        await self.session.commit()

    async def resolve_users_for_role(self, project_id: uuid.UUID, role: UserRole) -> list[uuid.UUID]:
        """Returns every user_id that should be treated as 'the <role> for
        this project' — used by the notification system to find recipients.
        PM/Site Engineer also include the legacy single-FK assignment on
        Project for backward compatibility; QS/Store Keeper have no legacy
        field and rely entirely on project_assignments."""
        project = await self._get_project(project_id)
        user_ids: set[uuid.UUID] = set()

        legacy_field = _LEGACY_FIELD_BY_ROLE.get(role)
        if legacy_field is not None:
            legacy_user_id = getattr(project, legacy_field)
            if legacy_user_id is not None:
                user_ids.add(legacy_user_id)

        assignments = await self.repo.list_for_project_and_role(project_id, role)
        user_ids.update(a.user_id for a in assignments)

        return list(user_ids)

    async def list_project_ids_for_user(self, user_id: uuid.UUID, role: UserRole) -> set[uuid.UUID]:
        """Inverse of resolve_users_for_role: every project_id this user should
        see as 'their' project for this role — project_assignments rows plus,
        for PM/Site Engineer, the legacy primary Project FK."""
        project_ids: set[uuid.UUID] = set(await self.repo.list_project_ids_for_user(user_id, role))

        legacy_field = _LEGACY_FIELD_BY_ROLE.get(role)
        if legacy_field is not None:
            result = await self.session.execute(select(Project.id).where(getattr(Project, legacy_field) == user_id))
            project_ids.update(result.scalars().all())

        return project_ids
