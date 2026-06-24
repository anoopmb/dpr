import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditAction
from app.models.organization_settings import OrganizationSettings
from app.schemas.organization_settings import OrganizationSettingsUpdate
from app.services.audit_service import AuditService, serialize_model


class OrganizationSettingsService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.audit = AuditService(session)

    async def get(self) -> OrganizationSettings:
        result = await self.session.execute(select(OrganizationSettings).limit(1))
        settings = result.scalar_one_or_none()
        if settings is None:
            settings = OrganizationSettings()
            self.session.add(settings)
            await self.session.commit()
            await self.session.refresh(settings)
        return settings

    async def update(self, data: OrganizationSettingsUpdate, actor_id: uuid.UUID) -> OrganizationSettings:
        settings = await self.get()
        before = serialize_model(settings)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(settings, field, value)
        await self.session.flush()
        await self.audit.record(
            entity_type="ORGANIZATION_SETTINGS",
            entity_id=settings.id,
            action=AuditAction.UPDATE,
            actor_id=actor_id,
            before=before,
            after=serialize_model(settings),
        )
        await self.session.commit()
        await self.session.refresh(settings)
        return settings
