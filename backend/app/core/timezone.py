from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization_settings import OrganizationSettings


async def get_org_zoneinfo(session: AsyncSession) -> ZoneInfo:
    """Reads the org's configured IANA timezone directly (no service-layer
    lazy-create here — falls back to UTC if the singleton settings row
    doesn't exist yet, which only happens before the very first read of
    /organization-settings)."""
    result = await session.execute(select(OrganizationSettings.timezone).limit(1))
    tz_name = result.scalar_one_or_none() or "UTC"
    return ZoneInfo(tz_name)


async def get_org_today(session: AsyncSession) -> date:
    """The org's current calendar date in its own configured timezone —
    use this instead of date.today() for any "what day is it" business
    logic (e.g. attendance/DPR date checks), since the server process's
    local clock may be on a different calendar day than the org's local
    time near midnight."""
    tz = await get_org_zoneinfo(session)
    return datetime.now(tz).date()
