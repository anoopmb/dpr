import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.audit import AuditAction


class AuditLogRead(BaseModel):
    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    action: AuditAction
    actor_id: uuid.UUID
    actor_name: str
    actor_login_id: str
    before_data: dict | None
    after_data: dict | None
    created_at: datetime


class AuditLogListRead(BaseModel):
    items: list[AuditLogRead]


class AuditEntityTypesRead(BaseModel):
    entity_types: list[str]
