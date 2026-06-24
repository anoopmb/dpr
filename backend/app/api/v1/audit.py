import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query

from app.api.deps import SessionDep, require_role
from app.models.audit import AuditAction
from app.models.user import UserRole
from app.schemas.audit import AuditEntityTypesRead, AuditLogListRead
from app.services.audit_service import AuditService

router = APIRouter(
    prefix="/audit-logs", tags=["audit"], dependencies=[Depends(require_role(UserRole.ADMIN))]
)


@router.get("", response_model=AuditLogListRead)
async def list_audit_logs(
    session: SessionDep,
    entity_type: str | None = Query(default=None),
    action: AuditAction | None = Query(default=None),
    actor_id: uuid.UUID | None = Query(default=None),
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    limit: int = Query(default=50, le=200),
    offset: int = Query(default=0),
) -> AuditLogListRead:
    items = await AuditService(session).list_logs(
        entity_type=entity_type,
        action=action,
        actor_id=actor_id,
        from_date=from_date,
        to_date=to_date,
        limit=limit,
        offset=offset,
    )
    return AuditLogListRead(items=items)


@router.get("/entity-types", response_model=AuditEntityTypesRead)
async def list_audit_entity_types(session: SessionDep) -> AuditEntityTypesRead:
    entity_types = await AuditService(session).list_entity_types()
    return AuditEntityTypesRead(entity_types=entity_types)
