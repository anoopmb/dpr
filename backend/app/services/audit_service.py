import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditAction, AuditLog
from app.models.base import TimestampedBase


def serialize_model(instance: TimestampedBase) -> dict:
    """Dumps a model's column values (not relationships) to a JSON-safe
    dict for AuditLog.before_data/after_data snapshots."""
    result: dict = {}
    for column in instance.__table__.columns:
        value = getattr(instance, column.name)
        if isinstance(value, Decimal):
            value = str(value)
        elif isinstance(value, (datetime, date)):
            value = value.isoformat()
        elif isinstance(value, uuid.UUID):
            value = str(value)
        elif isinstance(value, Enum):
            value = value.value
        result[column.name] = value
    return result


class AuditService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def record(
        self,
        *,
        entity_type: str,
        entity_id: uuid.UUID,
        action: AuditAction,
        actor_id: uuid.UUID,
        before: dict | None = None,
        after: dict | None = None,
    ) -> None:
        """Appends one AuditLog row to the current session — relies on the
        caller's own commit (already happening for the mutation itself) to
        persist it, so this never issues its own commit."""
        self.session.add(
            AuditLog(
                entity_type=entity_type,
                entity_id=entity_id,
                action=action,
                actor_id=actor_id,
                before_data=before,
                after_data=after,
            )
        )
