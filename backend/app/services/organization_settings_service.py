from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization_settings import OrganizationSettings
from app.schemas.organization_settings import OrganizationSettingsUpdate


class OrganizationSettingsService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self) -> OrganizationSettings:
        result = await self.session.execute(select(OrganizationSettings).limit(1))
        settings = result.scalar_one_or_none()
        if settings is None:
            settings = OrganizationSettings()
            self.session.add(settings)
            await self.session.commit()
            await self.session.refresh(settings)
        return settings

    async def update(self, data: OrganizationSettingsUpdate) -> OrganizationSettings:
        settings = await self.get()
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(settings, field, value)
        await self.session.commit()
        await self.session.refresh(settings)
        return settings
