import uuid
from datetime import date, datetime, time, timezone
from decimal import Decimal
from enum import Enum

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditAction, AuditLog
from app.models.base import TimestampedBase
from app.models.user import User
from app.schemas.audit import AuditLogRead


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

    async def list_logs(
        self,
        *,
        entity_type: str | None = None,
        action: AuditAction | None = None,
        actor_id: uuid.UUID | None = None,
        from_date: date | None = None,
        to_date: date | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[AuditLogRead]:
        query = (
            select(AuditLog, User.full_name, User.login_id)
            .join(User, AuditLog.actor_id == User.id)
            .order_by(AuditLog.created_at.desc())
        )
        if entity_type is not None:
            query = query.where(AuditLog.entity_type == entity_type)
        if action is not None:
            query = query.where(AuditLog.action == action)
        if actor_id is not None:
            query = query.where(AuditLog.actor_id == actor_id)
        if from_date is not None:
            query = query.where(AuditLog.created_at >= datetime.combine(from_date, time.min, tzinfo=timezone.utc))
        if to_date is not None:
            query = query.where(AuditLog.created_at <= datetime.combine(to_date, time.max, tzinfo=timezone.utc))
        query = query.limit(limit).offset(offset)

        result = await self.session.execute(query)
        return [
            AuditLogRead(
                id=log.id,
                entity_type=log.entity_type,
                entity_id=log.entity_id,
                action=log.action,
                actor_id=log.actor_id,
                actor_name=full_name,
                actor_login_id=login_id,
                before_data=log.before_data,
                after_data=log.after_data,
                created_at=log.created_at,
            )
            for log, full_name, login_id in result.all()
        ]

    async def list_entity_types(self) -> list[str]:
        result = await self.session.execute(
            select(AuditLog.entity_type).distinct().order_by(AuditLog.entity_type)
        )
        return list(result.scalars().all())
