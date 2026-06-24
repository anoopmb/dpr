import uuid

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUserDep, SessionDep, require_role
from app.models.user import UserRole
from app.schemas.organization_settings import (
    OrganizationBrandingRead,
    OrganizationSettingsRead,
    OrganizationSettingsUpdate,
)
from app.services.organization_settings_service import OrganizationSettingsService

router = APIRouter(prefix="/settings/organization", tags=["settings"])

branding_router = APIRouter(prefix="/settings/branding", tags=["settings"])


@branding_router.get("", response_model=OrganizationBrandingRead)
async def get_organization_branding(session: SessionDep) -> OrganizationBrandingRead:
    """Unauthenticated — backs the login page and the dynamic favicon, both
    of which render before any session exists."""
    settings = await OrganizationSettingsService(session).get()
    return OrganizationBrandingRead.model_validate(settings)


@router.get("", response_model=OrganizationSettingsRead)
async def get_organization_settings(session: SessionDep, _: CurrentUserDep) -> OrganizationSettingsRead:
    settings = await OrganizationSettingsService(session).get()
    return OrganizationSettingsRead.model_validate(settings)


@router.patch(
    "",
    response_model=OrganizationSettingsRead,
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)
async def update_organization_settings(
    data: OrganizationSettingsUpdate, session: SessionDep, current_user: CurrentUserDep
) -> OrganizationSettingsRead:
    settings = await OrganizationSettingsService(session).update(data, actor_id=uuid.UUID(current_user.id))
    return OrganizationSettingsRead.model_validate(settings)
