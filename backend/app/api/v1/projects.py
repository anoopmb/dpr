import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select

from app.api.deps import CurrentUserDep, SessionDep, require_role
from app.models.user import User, UserRole
from app.schemas.billing import ProjectSummaryRead
from app.schemas.profitability import ProfitabilityRead
from app.schemas.project import (
    CompletionExtensionCreate,
    CompletionExtensionRead,
    ProjectCreate,
    ProjectRead,
    ProjectUpdate,
)
from app.schemas.project_assignment import ProjectAssignmentCreate, ProjectAssignmentRead
from app.services.billing_service import BillingService
from app.services.profitability_service import ProfitabilityService
from app.services.project_assignment_service import ProjectAssignmentService
from app.services.project_service import ProjectService

router = APIRouter(prefix="/projects", tags=["projects"])


@router.post(
    "",
    response_model=ProjectRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(UserRole.ADMIN, UserRole.PROJECT_MANAGER))],
)
async def create_project(data: ProjectCreate, session: SessionDep, current_user: CurrentUserDep) -> ProjectRead:
    project = await ProjectService(session).create(data, actor_id=uuid.UUID(current_user.id))
    return ProjectRead.model_validate(project)


@router.get("", response_model=list[ProjectRead])
async def list_projects(
    session: SessionDep, current_user: CurrentUserDep, limit: int = 50, offset: int = 0
) -> list[ProjectRead]:
    projects = await ProjectService(session).list(
        uuid.UUID(current_user.id), current_user.role, limit=limit, offset=offset
    )
    return [ProjectRead.model_validate(p) for p in projects]


@router.get("/{project_id}", response_model=ProjectRead)
async def get_project(project_id: uuid.UUID, session: SessionDep, _: CurrentUserDep) -> ProjectRead:
    project = await ProjectService(session).get(project_id)
    return ProjectRead.model_validate(project)


@router.patch(
    "/{project_id}",
    response_model=ProjectRead,
    dependencies=[Depends(require_role(UserRole.ADMIN, UserRole.PROJECT_MANAGER))],
)
async def update_project(
    project_id: uuid.UUID, data: ProjectUpdate, session: SessionDep, current_user: CurrentUserDep
) -> ProjectRead:
    project = await ProjectService(session).update(project_id, data, actor_id=uuid.UUID(current_user.id))
    return ProjectRead.model_validate(project)


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)
async def delete_project(
    project_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep
) -> None:
    await ProjectService(session).delete(project_id, actor_id=uuid.UUID(current_user.id))


@router.post(
    "/{project_id}/extend-completion",
    response_model=CompletionExtensionRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(UserRole.ADMIN, UserRole.PROJECT_MANAGER))],
)
async def extend_completion(
    project_id: uuid.UUID,
    data: CompletionExtensionCreate,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> CompletionExtensionRead:
    extension = await ProjectService(session).extend_completion(
        project_id, data, actor_id=uuid.UUID(current_user.id)
    )
    return CompletionExtensionRead(
        **{k: getattr(extension, k) for k in (
            "id", "project_id", "previous_completion_date", "new_completion_date",
            "reason", "extended_by", "extended_at",
        )},
        extended_by_name=current_user.full_name,
    )


@router.get("/{project_id}/completion-extensions", response_model=list[CompletionExtensionRead])
async def list_completion_extensions(
    project_id: uuid.UUID, session: SessionDep, _: CurrentUserDep
) -> list[CompletionExtensionRead]:
    extensions = await ProjectService(session).list_completion_extensions(project_id)
    user_ids = {e.extended_by for e in extensions}
    name_by_id: dict[uuid.UUID, str] = {}
    if user_ids:
        result = await session.execute(select(User.id, User.full_name).where(User.id.in_(user_ids)))
        name_by_id = {uid: name for uid, name in result.all()}
    return [
        CompletionExtensionRead(
            id=e.id,
            project_id=e.project_id,
            previous_completion_date=e.previous_completion_date,
            new_completion_date=e.new_completion_date,
            reason=e.reason,
            extended_by=e.extended_by,
            extended_by_name=name_by_id.get(e.extended_by, "Unknown"),
            extended_at=e.extended_at,
        )
        for e in extensions
    ]


@router.get("/{project_id}/summary", response_model=ProjectSummaryRead)
async def get_project_summary(
    project_id: uuid.UUID, session: SessionDep, _: CurrentUserDep
) -> ProjectSummaryRead:
    project = await ProjectService(session).get(project_id)
    return await BillingService(session).get_project_summary(project_id, project.contract_value)


@router.get("/{project_id}/profitability", response_model=ProfitabilityRead)
async def get_profitability(
    project_id: uuid.UUID,
    session: SessionDep,
    _: CurrentUserDep,
    from_date: date = Query(default=None),
    to_date: date = Query(default=None),
) -> ProfitabilityRead:
    from datetime import date as date_type
    import calendar
    today = date_type.today()
    effective_from = from_date if from_date is not None else today.replace(day=1)
    last_day = calendar.monthrange(today.year, today.month)[1]
    effective_to = to_date if to_date is not None else today.replace(day=last_day)
    return await ProfitabilityService(session).get(project_id, effective_from, effective_to)


@router.get("/{project_id}/assignments", response_model=list[ProjectAssignmentRead])
async def list_project_assignments(
    project_id: uuid.UUID, session: SessionDep, _: CurrentUserDep
) -> list[ProjectAssignmentRead]:
    assignments = await ProjectAssignmentService(session).list_for_project(project_id)
    return [ProjectAssignmentRead.model_validate(a) for a in assignments]


@router.post(
    "/{project_id}/assignments",
    response_model=ProjectAssignmentRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(UserRole.ADMIN, UserRole.PROJECT_MANAGER))],
)
async def create_project_assignment(
    project_id: uuid.UUID, data: ProjectAssignmentCreate, session: SessionDep, current_user: CurrentUserDep
) -> ProjectAssignmentRead:
    assignment = await ProjectAssignmentService(session).assign(
        project_id, data.user_id, data.role, actor_id=uuid.UUID(current_user.id)
    )
    return ProjectAssignmentRead.model_validate(assignment)


@router.delete(
    "/{project_id}/assignments/{assignment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(UserRole.ADMIN, UserRole.PROJECT_MANAGER))],
)
async def delete_project_assignment(
    project_id: uuid.UUID, assignment_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep
) -> None:
    await ProjectAssignmentService(session).unassign(project_id, assignment_id, actor_id=uuid.UUID(current_user.id))
