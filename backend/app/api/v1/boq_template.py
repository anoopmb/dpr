import uuid

from fastapi import APIRouter, Depends, status

from app.api.deps import CurrentUserDep, SessionDep, require_role
from app.models.user import UserRole
from app.schemas.boq_template import (
    BoqBulkImportResult,
    BoqTemplateSaveFromProject,
    BoqTemplateSummary,
    BoqTemplateRead,
)
from app.services.boq_template_service import BoqTemplateService

_WRITE_ROLES = (UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.QUANTITY_SURVEYOR)

router = APIRouter(prefix="/boq-templates", tags=["boq"])


@router.get("", response_model=list[BoqTemplateSummary])
async def list_boq_templates(session: SessionDep, _: CurrentUserDep) -> list[BoqTemplateSummary]:
    return await BoqTemplateService(session).list()


@router.get("/{template_id}", response_model=BoqTemplateRead)
async def get_boq_template(template_id: uuid.UUID, session: SessionDep, _: CurrentUserDep) -> BoqTemplateRead:
    return await BoqTemplateService(session).get(template_id)


@router.post(
    "/from-project/{project_id}",
    response_model=BoqTemplateRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*_WRITE_ROLES))],
)
async def save_boq_template_from_project(
    project_id: uuid.UUID,
    data: BoqTemplateSaveFromProject,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> BoqTemplateRead:
    return await BoqTemplateService(session).create_from_project(
        project_id, data, actor_id=uuid.UUID(current_user.id)
    )


@router.post(
    "/{template_id}/apply/{project_id}",
    response_model=BoqBulkImportResult,
    dependencies=[Depends(require_role(*_WRITE_ROLES))],
)
async def apply_boq_template(
    template_id: uuid.UUID,
    project_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> BoqBulkImportResult:
    return await BoqTemplateService(session).apply_to_project(
        template_id, project_id, actor_id=uuid.UUID(current_user.id)
    )


@router.delete(
    "/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(*_WRITE_ROLES))],
)
async def delete_boq_template(
    template_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep
) -> None:
    await BoqTemplateService(session).delete(template_id, actor_id=uuid.UUID(current_user.id))
