import uuid

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import CurrentUserDep, SessionDep, require_role
from app.models.user import UserRole
from app.models.workflow_config import WorkflowEntityType
from app.schemas.workflow_config import (
    WorkflowDefinitionCreate,
    WorkflowDefinitionRead,
    WorkflowDefinitionUpdate,
)
from app.services.workflow_config_service import WorkflowConfigService

router = APIRouter(prefix="/workflow-definitions", tags=["workflow-config"])


@router.get("", response_model=WorkflowDefinitionRead)
async def get_effective_workflow(
    entity_type: WorkflowEntityType,
    session: SessionDep,
    _: CurrentUserDep,
    project_id: uuid.UUID | None = Query(default=None),
) -> WorkflowDefinitionRead:
    """The workflow that actually governs a record right now — project
    override if one exists and is active, else the org-wide default. Any
    authenticated user can read this; it drives action-button gating and
    stage labels/colors on the approval-action pages."""
    definition = await WorkflowConfigService(session).get_effective_definition(entity_type, project_id)
    return WorkflowDefinitionRead.model_validate(definition)


@router.get(
    "/all",
    response_model=list[WorkflowDefinitionRead],
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)
async def list_workflow_definitions(
    entity_type: WorkflowEntityType, session: SessionDep
) -> list[WorkflowDefinitionRead]:
    """Every definition for this entity type — the org default plus any
    project overrides. Backs the admin configuration page."""
    definitions = await WorkflowConfigService(session).list_definitions(entity_type)
    return [WorkflowDefinitionRead.model_validate(d) for d in definitions]


@router.post(
    "",
    response_model=WorkflowDefinitionRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)
async def create_workflow_definition(
    data: WorkflowDefinitionCreate, session: SessionDep, current_user: CurrentUserDep
) -> WorkflowDefinitionRead:
    definition = await WorkflowConfigService(session).create(data, actor_id=uuid.UUID(current_user.id))
    return WorkflowDefinitionRead.model_validate(definition)


@router.patch(
    "/{definition_id}",
    response_model=WorkflowDefinitionRead,
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)
async def update_workflow_definition(
    definition_id: uuid.UUID, data: WorkflowDefinitionUpdate, session: SessionDep, current_user: CurrentUserDep
) -> WorkflowDefinitionRead:
    definition = await WorkflowConfigService(session).update(
        definition_id, data, actor_id=uuid.UUID(current_user.id)
    )
    return WorkflowDefinitionRead.model_validate(definition)


@router.delete(
    "/{definition_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)
async def delete_workflow_definition(
    definition_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep
) -> None:
    await WorkflowConfigService(session).delete(definition_id, actor_id=uuid.UUID(current_user.id))
