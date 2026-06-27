import uuid

from fastapi import APIRouter, Depends, status

from app.api.deps import CurrentUserDep, SessionDep, require_role
from app.models.user import UserRole
from app.schemas.boq import BoqItemCreate, BoqItemRead, BoqItemUpdate, BoqSectionCreate, BoqSectionRead, BoqSectionUpdate
from app.schemas.boq_revision import BoqRevisionCreate, BoqRevisionRead, BoqRevisionReject
from app.schemas.boq_template import BoqBulkImportRequest, BoqBulkImportResult
from app.services.boq_service import BoqService

_WRITE_ROLES = (UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.QUANTITY_SURVEYOR)
_REVISION_CREATE_ROLES = (UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.QUANTITY_SURVEYOR)

boq_router = APIRouter(prefix="/boq", tags=["boq"])
sections_router = APIRouter(prefix="/boq-sections", tags=["boq"])
items_router = APIRouter(prefix="/boq-items", tags=["boq"])
revisions_router = APIRouter(prefix="/boq-revisions", tags=["boq"])


@sections_router.post(
    "",
    response_model=BoqSectionRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*_WRITE_ROLES))],
)
async def create_boq_section(data: BoqSectionCreate, session: SessionDep, current_user: CurrentUserDep) -> BoqSectionRead:
    section = await BoqService(session).create_section(data, actor_id=uuid.UUID(current_user.id))
    return BoqSectionRead.model_validate(section)


@sections_router.get("/by-project/{project_id}", response_model=list[BoqSectionRead])
async def list_boq_sections_for_project(
    project_id: uuid.UUID, session: SessionDep, _: CurrentUserDep
) -> list[BoqSectionRead]:
    return await BoqService(session).list_sections_with_items(project_id)


@sections_router.patch(
    "/{section_id}",
    response_model=BoqSectionRead,
    dependencies=[Depends(require_role(*_WRITE_ROLES))],
)
async def update_boq_section(
    section_id: uuid.UUID, data: BoqSectionUpdate, session: SessionDep, current_user: CurrentUserDep
) -> BoqSectionRead:
    section = await BoqService(session).update_section(section_id, data, actor_id=uuid.UUID(current_user.id))
    return BoqSectionRead.model_validate(section)


@sections_router.delete(
    "/{section_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(*_WRITE_ROLES))],
)
async def delete_boq_section(section_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep) -> None:
    await BoqService(session).delete_section(section_id, actor_id=uuid.UUID(current_user.id))


@items_router.post(
    "",
    response_model=BoqItemRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*_WRITE_ROLES))],
)
async def create_boq_item(data: BoqItemCreate, session: SessionDep, current_user: CurrentUserDep) -> BoqItemRead:
    svc = BoqService(session)
    item = await svc.create(data, actor_id=uuid.UUID(current_user.id))
    return await svc.get_item_read(item.id)


@items_router.get("/by-project/{project_id}", response_model=list[BoqItemRead])
async def list_boq_items_for_project(
    project_id: uuid.UUID, session: SessionDep, _: CurrentUserDep
) -> list[BoqItemRead]:
    svc = BoqService(session)
    items = await svc.list_for_project(project_id)
    return [await svc.get_item_read(i.id) for i in items]


@items_router.get("/{boq_item_id}", response_model=BoqItemRead)
async def get_boq_item(boq_item_id: uuid.UUID, session: SessionDep, _: CurrentUserDep) -> BoqItemRead:
    return await BoqService(session).get_item_read(boq_item_id)


@items_router.patch(
    "/{boq_item_id}",
    response_model=BoqItemRead,
    dependencies=[Depends(require_role(*_WRITE_ROLES))],
)
async def update_boq_item(
    boq_item_id: uuid.UUID, data: BoqItemUpdate, session: SessionDep, current_user: CurrentUserDep
) -> BoqItemRead:
    svc = BoqService(session)
    await svc.update_item(boq_item_id, data, actor_id=uuid.UUID(current_user.id))
    return await svc.get_item_read(boq_item_id)


@items_router.delete(
    "/{boq_item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(*_WRITE_ROLES))],
)
async def delete_boq_item(boq_item_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep) -> None:
    await BoqService(session).delete_item(boq_item_id, actor_id=uuid.UUID(current_user.id))


# ── Revision endpoints ────────────────────────────────────────────────────────

@items_router.post(
    "/{boq_item_id}/revisions",
    response_model=BoqRevisionRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*_REVISION_CREATE_ROLES))],
)
async def create_boq_revision(
    boq_item_id: uuid.UUID, data: BoqRevisionCreate, session: SessionDep, current_user: CurrentUserDep
) -> BoqRevisionRead:
    revision = await BoqService(session).create_revision(boq_item_id, data, actor_id=uuid.UUID(current_user.id))
    return BoqRevisionRead.model_validate(revision)


@items_router.get("/{boq_item_id}/revisions", response_model=list[BoqRevisionRead])
async def list_boq_revisions(
    boq_item_id: uuid.UUID, session: SessionDep, _: CurrentUserDep
) -> list[BoqRevisionRead]:
    revisions = await BoqService(session).list_revisions(boq_item_id)
    return [BoqRevisionRead.model_validate(r) for r in revisions]


@revisions_router.post(
    "/{revision_id}/approve",
    response_model=BoqRevisionRead,
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)
async def approve_boq_revision(
    revision_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep
) -> BoqRevisionRead:
    revision = await BoqService(session).approve_revision(revision_id, actor_id=uuid.UUID(current_user.id))
    return BoqRevisionRead.model_validate(revision)


@revisions_router.post(
    "/{revision_id}/reject",
    response_model=BoqRevisionRead,
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)
async def reject_boq_revision(
    revision_id: uuid.UUID, data: BoqRevisionReject, session: SessionDep, current_user: CurrentUserDep
) -> BoqRevisionRead:
    revision = await BoqService(session).reject_revision(
        revision_id, actor_id=uuid.UUID(current_user.id), rejected_reason=data.rejected_reason
    )
    return BoqRevisionRead.model_validate(revision)


@boq_router.get(
    "/revisions/pending",
    response_model=list[BoqRevisionRead],
)
async def list_pending_boq_revisions(
    project_id: uuid.UUID, session: SessionDep, _: CurrentUserDep
) -> list[BoqRevisionRead]:
    revisions = await BoqService(session).list_pending_revisions(project_id)
    return [BoqRevisionRead.model_validate(r) for r in revisions]


@boq_router.post(
    "/import/{project_id}",
    response_model=BoqBulkImportResult,
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_role(*_WRITE_ROLES))],
)
async def bulk_import_boq(
    project_id: uuid.UUID,
    data: BoqBulkImportRequest,
    session: SessionDep,
    current_user: CurrentUserDep,
) -> BoqBulkImportResult:
    return await BoqService(session).bulk_import(
        project_id, data.items, actor_id=uuid.UUID(current_user.id)
    )
