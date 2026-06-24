import uuid
from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status

from app.api.deps import CurrentUserDep, SessionDep, require_role
from app.models.user import UserRole
from app.schemas.dpr import (
    DprHeaderCreate,
    DprHeaderRead,
    DprHeaderUpdate,
    DprIssueCreate,
    DprMachineryCreate,
    DprMachineryUpdate,
    DprMaterialCreate,
    DprMaterialUpdate,
    DprProductionBulkUpsert,
    DprProductionEntryRead,
    DprWorkItemCreate,
    ProductionProgressRead,
)
from app.schemas.dpr_report import DprMonthlyReportRead
from app.services.dpr_service import DprProductionService, DprService

router = APIRouter(prefix="/dpr", tags=["dpr"])

_FIELD_ROLES = (UserRole.SITE_ENGINEER, UserRole.PROJECT_MANAGER, UserRole.ADMIN)


@router.post(
    "",
    response_model=DprHeaderRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*_FIELD_ROLES))],
)
async def create_dpr(data: DprHeaderCreate, session: SessionDep, current_user: CurrentUserDep) -> DprHeaderRead:
    header = await DprService(session).create_header(
        data,
        submitted_by=uuid.UUID(current_user.id),
        default_supervisor_name=current_user.full_name or None,
    )
    return DprHeaderRead.model_validate(header)


@router.patch(
    "/{header_id}",
    response_model=DprHeaderRead,
    dependencies=[Depends(require_role(*_FIELD_ROLES))],
)
async def update_dpr_header(
    header_id: uuid.UUID, data: DprHeaderUpdate, session: SessionDep, current_user: CurrentUserDep
) -> DprHeaderRead:
    header = await DprService(session).update_header(header_id, data, actor_id=uuid.UUID(current_user.id))
    return DprHeaderRead.model_validate(header)


@router.delete(
    "/{header_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(*_FIELD_ROLES))],
)
async def delete_dpr_header(
    header_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep
) -> None:
    await DprService(session).delete_header(header_id, actor_id=uuid.UUID(current_user.id))


@router.get("/by-project/{project_id}", response_model=list[DprHeaderRead])
async def list_dpr_for_project(project_id: uuid.UUID, session: SessionDep, _: CurrentUserDep) -> list[DprHeaderRead]:
    headers = await DprService(session).list_for_project(project_id)
    return [DprHeaderRead.model_validate(h) for h in headers]


@router.get("/{header_id}", response_model=DprHeaderRead)
async def get_dpr(header_id: uuid.UUID, session: SessionDep, _: CurrentUserDep) -> DprHeaderRead:
    header = await DprService(session).get(header_id)
    return DprHeaderRead.model_validate(header)


@router.post("/{header_id}/work-items", response_model=DprHeaderRead, dependencies=[Depends(require_role(*_FIELD_ROLES))])
async def add_work_item(
    header_id: uuid.UUID, data: DprWorkItemCreate, session: SessionDep, current_user: CurrentUserDep
) -> DprHeaderRead:
    header = await DprService(session).add_work_item(header_id, data, actor_id=uuid.UUID(current_user.id))
    return DprHeaderRead.model_validate(header)


@router.post("/{header_id}/issues", response_model=DprHeaderRead, dependencies=[Depends(require_role(*_FIELD_ROLES))])
async def add_issue(
    header_id: uuid.UUID, data: DprIssueCreate, session: SessionDep, current_user: CurrentUserDep
) -> DprHeaderRead:
    header = await DprService(session).add_issue(header_id, data, actor_id=uuid.UUID(current_user.id))
    return DprHeaderRead.model_validate(header)


@router.post("/{header_id}/materials", response_model=DprHeaderRead, dependencies=[Depends(require_role(*_FIELD_ROLES))])
async def add_material(
    header_id: uuid.UUID, data: DprMaterialCreate, session: SessionDep, current_user: CurrentUserDep
) -> DprHeaderRead:
    header = await DprService(session).add_material(header_id, data, actor_id=uuid.UUID(current_user.id))
    return DprHeaderRead.model_validate(header)


@router.patch(
    "/materials/{item_id}",
    response_model=DprHeaderRead,
    dependencies=[Depends(require_role(*_FIELD_ROLES))],
)
async def update_material(
    item_id: uuid.UUID, data: DprMaterialUpdate, session: SessionDep, current_user: CurrentUserDep
) -> DprHeaderRead:
    header = await DprService(session).update_material(item_id, data, actor_id=uuid.UUID(current_user.id))
    return DprHeaderRead.model_validate(header)


@router.delete(
    "/materials/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(*_FIELD_ROLES))],
)
async def delete_material(
    item_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep
) -> None:
    await DprService(session).delete_material(item_id, actor_id=uuid.UUID(current_user.id))


@router.post("/{header_id}/machinery", response_model=DprHeaderRead, dependencies=[Depends(require_role(*_FIELD_ROLES))])
async def add_machinery(
    header_id: uuid.UUID, data: DprMachineryCreate, session: SessionDep, current_user: CurrentUserDep
) -> DprHeaderRead:
    header = await DprService(session).add_machinery(header_id, data, actor_id=uuid.UUID(current_user.id))
    return DprHeaderRead.model_validate(header)


@router.patch(
    "/machinery/{item_id}",
    response_model=DprHeaderRead,
    dependencies=[Depends(require_role(*_FIELD_ROLES))],
)
async def update_machinery(
    item_id: uuid.UUID, data: DprMachineryUpdate, session: SessionDep, current_user: CurrentUserDep
) -> DprHeaderRead:
    header = await DprService(session).update_machinery(item_id, data, actor_id=uuid.UUID(current_user.id))
    return DprHeaderRead.model_validate(header)


@router.delete(
    "/machinery/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(*_FIELD_ROLES))],
)
async def delete_machinery(
    item_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep
) -> None:
    await DprService(session).delete_machinery(item_id, actor_id=uuid.UUID(current_user.id))


@router.post("/{header_id}/submit", response_model=DprHeaderRead, dependencies=[Depends(require_role(*_FIELD_ROLES))])
async def submit_dpr(
    header_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep, background_tasks: BackgroundTasks
) -> DprHeaderRead:
    header = await DprService(session, background_tasks).submit(header_id, actor_id=uuid.UUID(current_user.id))
    return DprHeaderRead.model_validate(header)


@router.put(
    "/{header_id}/production",
    response_model=list[DprProductionEntryRead],
    dependencies=[Depends(require_role(*_FIELD_ROLES))],
)
async def bulk_upsert_production(
    header_id: uuid.UUID, data: DprProductionBulkUpsert, session: SessionDep, current_user: CurrentUserDep
) -> list[DprProductionEntryRead]:
    entries = await DprProductionService(session).bulk_upsert(header_id, data, actor_id=uuid.UUID(current_user.id))
    return [DprProductionEntryRead.model_validate(e) for e in entries]


@router.get("/{header_id}/production", response_model=list[DprProductionEntryRead])
async def list_production_entries(
    header_id: uuid.UUID, session: SessionDep, _: CurrentUserDep
) -> list[DprProductionEntryRead]:
    entries = await DprProductionService(session).list_for_header(header_id)
    return [DprProductionEntryRead.model_validate(e) for e in entries]


@router.get("/progress/{project_id}", response_model=ProductionProgressRead)
async def get_production_progress(
    project_id: uuid.UUID,
    session: SessionDep,
    _: CurrentUserDep,
    as_of: date = Query(default=None),
) -> ProductionProgressRead:
    from datetime import date as date_type
    effective_date = as_of if as_of is not None else date_type.today()
    return await DprProductionService(session).get_progress(project_id, effective_date)


@router.get("/report/{project_id}", response_model=DprMonthlyReportRead)
async def get_monthly_dpr_report(
    project_id: uuid.UUID,
    session: SessionDep,
    _: CurrentUserDep,
    month: str = Query(pattern=r"^\d{4}-\d{2}$"),
) -> DprMonthlyReportRead:
    return await DprProductionService(session).get_monthly_report(project_id, month)
