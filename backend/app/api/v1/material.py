import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, status

from app.api.deps import CurrentUserDep, SessionDep, require_role
from app.models.user import UserRole
from app.schemas.material import (
    MaterialIndentCreate,
    MaterialIndentItemRead,
    MaterialIndentRead,
    MaterialIssueCreate,
    MaterialReceiptCreate,
)
from app.services.material_service import MaterialIndentService

router = APIRouter(prefix="/material-indents", tags=["material"])

_REQUESTER_ROLES = (UserRole.SITE_ENGINEER, UserRole.PROJECT_MANAGER, UserRole.ADMIN)


@router.post(
    "",
    response_model=MaterialIndentRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*_REQUESTER_ROLES))],
)
async def create_indent(data: MaterialIndentCreate, session: SessionDep, current_user: CurrentUserDep) -> MaterialIndentRead:
    indent = await MaterialIndentService(session).create(data, requested_by=uuid.UUID(current_user.id))
    return MaterialIndentRead.model_validate(indent)


@router.get("/by-project/{project_id}", response_model=list[MaterialIndentRead])
async def list_indents_for_project(
    project_id: uuid.UUID, session: SessionDep, _: CurrentUserDep
) -> list[MaterialIndentRead]:
    indents = await MaterialIndentService(session).list_for_project(project_id)
    return [MaterialIndentRead.model_validate(i) for i in indents]


@router.get("/{indent_id}", response_model=MaterialIndentRead)
async def get_indent(indent_id: uuid.UUID, session: SessionDep, _: CurrentUserDep) -> MaterialIndentRead:
    indent = await MaterialIndentService(session).get(indent_id)
    return MaterialIndentRead.model_validate(indent)


@router.post("/{indent_id}/submit", response_model=MaterialIndentRead)
async def submit_indent(
    indent_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep, background_tasks: BackgroundTasks
) -> MaterialIndentRead:
    indent = await MaterialIndentService(session, background_tasks).submit(
        indent_id, actor_id=uuid.UUID(current_user.id), actor_role=current_user.role
    )
    return MaterialIndentRead.model_validate(indent)


@router.post("/{indent_id}/approve", response_model=MaterialIndentRead)
async def approve_indent(
    indent_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep, background_tasks: BackgroundTasks
) -> MaterialIndentRead:
    indent = await MaterialIndentService(session, background_tasks).approve(
        indent_id, actor_id=uuid.UUID(current_user.id), actor_role=current_user.role
    )
    return MaterialIndentRead.model_validate(indent)


@router.post("/{indent_id}/reject", response_model=MaterialIndentRead)
async def reject_indent(
    indent_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep, background_tasks: BackgroundTasks
) -> MaterialIndentRead:
    indent = await MaterialIndentService(session, background_tasks).reject(indent_id, actor_role=current_user.role)
    return MaterialIndentRead.model_validate(indent)


@router.post("/{indent_id}/cancel", response_model=MaterialIndentRead)
async def cancel_indent(
    indent_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep, background_tasks: BackgroundTasks
) -> MaterialIndentRead:
    indent = await MaterialIndentService(session, background_tasks).cancel(
        indent_id, actor_id=uuid.UUID(current_user.id), actor_role=current_user.role
    )
    return MaterialIndentRead.model_validate(indent)


@router.post("/items/{item_id}/issue", response_model=MaterialIndentItemRead)
async def issue_indent_item(
    item_id: uuid.UUID,
    data: MaterialIssueCreate,
    session: SessionDep,
    current_user: CurrentUserDep,
    background_tasks: BackgroundTasks,
) -> MaterialIndentItemRead:
    item = await MaterialIndentService(session, background_tasks).issue_item(
        item_id, data, actor_id=uuid.UUID(current_user.id), actor_role=current_user.role
    )
    return MaterialIndentItemRead.model_validate(item)


@router.post("/items/{item_id}/receive", response_model=MaterialIndentItemRead)
async def receive_indent_item(
    item_id: uuid.UUID,
    data: MaterialReceiptCreate,
    session: SessionDep,
    current_user: CurrentUserDep,
    background_tasks: BackgroundTasks,
) -> MaterialIndentItemRead:
    item = await MaterialIndentService(session, background_tasks).receive_item(
        item_id, data, actor_id=uuid.UUID(current_user.id), actor_role=current_user.role
    )
    return MaterialIndentItemRead.model_validate(item)
