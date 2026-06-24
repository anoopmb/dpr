import uuid

from pydantic import BaseModel, ConfigDict

from app.models.user import UserRole


class ProjectAssignmentCreate(BaseModel):
    user_id: uuid.UUID
    role: UserRole


class ProjectAssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    user_id: uuid.UUID
    role: str
