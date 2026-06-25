import uuid

from pydantic import BaseModel, ConfigDict, Field

from app.models.user import UserRole
from app.models.workflow_config import WorkflowEntityType


class WorkflowStageInput(BaseModel):
    """One approval level in a create/update payload. `sequence_order` here
    is advisory — the service renumbers levels 1..N by list position, so
    reordering is just "send the list in the new order"."""

    status_code: str = Field(min_length=1, max_length=50)
    label: str = Field(min_length=1, max_length=100)
    allowed_roles: list[UserRole] = Field(min_length=1)
    allow_reject: bool = True
    feeds_production: bool = False
    is_final_approval: bool = False


class WorkflowStageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sequence_order: int
    status_code: str
    label: str
    allowed_roles: list[UserRole]
    allow_reject: bool
    feeds_production: bool
    is_final_approval: bool


class WorkflowDefinitionCreate(BaseModel):
    entity_type: WorkflowEntityType
    project_id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=200)
    approvals_enabled: bool = True
    lock_allowed_roles: list[UserRole] | None = None
    levels: list[WorkflowStageInput] = Field(default_factory=list)


class WorkflowDefinitionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    approvals_enabled: bool | None = None
    lock_allowed_roles: list[UserRole] | None = None
    levels: list[WorkflowStageInput] | None = None


class WorkflowDefinitionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    entity_type: WorkflowEntityType
    project_id: uuid.UUID | None
    name: str
    approvals_enabled: bool
    lock_allowed_roles: list[UserRole] | None
    is_active: bool
    is_org_default: bool
    levels: list[WorkflowStageRead]
