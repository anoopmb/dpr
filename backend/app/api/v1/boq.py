import uuid

from fastapi import APIRouter, Depends, status

from app.api.deps import CurrentUserDep, SessionDep, require_role
from app.models.user import UserRole
from app.schemas.boq import BoqItemCreate, BoqItemRead, BoqItemUpdate, BoqSectionCreate, BoqSectionRead, BoqSectionUpdate
from app.services.boq_service import BoqService

_WRITE_ROLES = (UserRole.ADMIN, UserRole.PROJECT_MANAGER, UserRole.QUANTITY_SURVEYOR)

router = APIRouter(tags=["boq"])
sections_router = APIRouter(prefix="/boq-sections", tags=["boq"])
items_router = APIRouter(prefix="/boq-items", tags=["boq"])


@sections_router.post(
    "",
    response_model=BoqSectionRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*_WRITE_ROLES))],
)
async def create_boq_section(data: BoqSectionCreate, session: SessionDep) -> BoqSectionRead:
    section = await BoqService(session).create_section(data)
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
    section_id: uuid.UUID, data: BoqSectionUpdate, session: SessionDep
) -> BoqSectionRead:
    section = await BoqService(session).update_section(section_id, data)
    return BoqSectionRead.model_validate(section)


@sections_router.delete(
    "/{section_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(*_WRITE_ROLES))],
)
async def delete_boq_section(section_id: uuid.UUID, session: SessionDep) -> None:
    await BoqService(session).delete_section(section_id)


@items_router.post(
    "",
    response_model=BoqItemRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*_WRITE_ROLES))],
)
async def create_boq_item(data: BoqItemCreate, session: SessionDep) -> BoqItemRead:
    item = await BoqService(session).create(data)
    return BoqItemRead.model_validate(item)


@items_router.get("/by-project/{project_id}", response_model=list[BoqItemRead])
async def list_boq_items_for_project(
    project_id: uuid.UUID, session: SessionDep, _: CurrentUserDep
) -> list[BoqItemRead]:
    items = await BoqService(session).list_for_project(project_id)
    return [BoqItemRead.model_validate(i) for i in items]


@items_router.get("/{boq_item_id}", response_model=BoqItemRead)
async def get_boq_item(boq_item_id: uuid.UUID, session: SessionDep, _: CurrentUserDep) -> BoqItemRead:
    item = await BoqService(session).get(boq_item_id)
    return BoqItemRead.model_validate(item)


@items_router.patch(
    "/{boq_item_id}",
    response_model=BoqItemRead,
    dependencies=[Depends(require_role(*_WRITE_ROLES))],
)
async def update_boq_item(boq_item_id: uuid.UUID, data: BoqItemUpdate, session: SessionDep) -> BoqItemRead:
    item = await BoqService(session).update_item(boq_item_id, data)
    return BoqItemRead.model_validate(item)


@items_router.delete(
    "/{boq_item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(*_WRITE_ROLES))],
)
async def delete_boq_item(boq_item_id: uuid.UUID, session: SessionDep) -> None:
    await BoqService(session).delete_item(boq_item_id)
