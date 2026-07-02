import uuid
from datetime import date

from fastapi import APIRouter, BackgroundTasks, Depends, Query, status
from sqlalchemy import select

from app.api.deps import CurrentUserDep, SessionDep, require_role
from app.models.measurement import Measurement
from app.models.user import User, UserRole
from app.schemas.dpr import (
    DprApprovalRequest,
    DprHeaderApprovalRead,
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
    DprRejectRequest,
    DprWorkItemCreate,
    ProductionProgressRead,
)
from app.schemas.dpr_labour import DprLabourCreate, DprLabourRead, DprLabourSuggestion, DprLabourUpdate
from app.schemas.dpr_report import DprMonthlyReportRead
from app.schemas.measurement import MeasurementRead
from app.services.dpr_service import DprProductionService, DprService
from app.services.measurement_service import MeasurementService

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


@router.post("/{header_id}/approve", response_model=DprHeaderRead)
async def approve_dpr(
    header_id: uuid.UUID,
    data: DprApprovalRequest,
    session: SessionDep,
    current_user: CurrentUserDep,
    background_tasks: BackgroundTasks,
) -> DprHeaderRead:
    header = await DprService(session, background_tasks).approve(
        header_id, actor_id=uuid.UUID(current_user.id), actor_role=current_user.role, data=data
    )
    return DprHeaderRead.model_validate(header)


@router.post("/{header_id}/reject", response_model=DprHeaderRead)
async def reject_dpr(
    header_id: uuid.UUID,
    data: DprRejectRequest,
    session: SessionDep,
    current_user: CurrentUserDep,
    background_tasks: BackgroundTasks,
) -> DprHeaderRead:
    header = await DprService(session, background_tasks).reject(
        header_id, actor_id=uuid.UUID(current_user.id), actor_role=current_user.role, data=data
    )
    return DprHeaderRead.model_validate(header)


@router.get("/{header_id}/approvals", response_model=list[DprHeaderApprovalRead])
async def list_dpr_approvals(
    header_id: uuid.UUID, session: SessionDep, _: CurrentUserDep
) -> list[DprHeaderApprovalRead]:
    rows = await DprService(session).list_approvals(header_id)
    return [
        DprHeaderApprovalRead(
            id=approval.id,
            dpr_header_id=approval.dpr_header_id,
            from_status=approval.from_status,
            to_status=approval.to_status,
            acted_by=approval.acted_by,
            actor_name=full_name,
            remarks=approval.remarks,
            acted_at=approval.acted_at,
        )
        for approval, full_name in rows
    ]


@router.get("/{header_id}/labour/suggestions", response_model=list[DprLabourSuggestion])
async def get_labour_suggestions(
    header_id: uuid.UUID, session: SessionDep, _: CurrentUserDep
) -> list[DprLabourSuggestion]:
    return await DprService(session).list_labour_suggestions(header_id)


@router.get("/{header_id}/labour", response_model=list[DprLabourRead])
async def list_labour(header_id: uuid.UUID, session: SessionDep, _: CurrentUserDep) -> list[DprLabourRead]:
    from app.models.worker import Worker as WorkerModel
    entries = await DprService(session).list_labour(header_id)
    result = []
    for entry in entries:
        worker = await session.get(WorkerModel, entry.worker_id)
        result.append(
            DprLabourRead(
                id=entry.id,
                dpr_header_id=entry.dpr_header_id,
                worker_id=entry.worker_id,
                worker_name=worker.full_name if worker else "Unknown",
                worker_type=worker.worker_type if worker else "NORMAL",
                wage_unit=worker.wage_unit if worker else None,
                quantity=entry.quantity,
                rate=entry.rate,
                amount=entry.amount,
                overtime_amount=entry.overtime_amount,
                contractor_workers_count=entry.contractor_workers_count,
                remarks=entry.remarks,
            )
        )
    return result


@router.post(
    "/{header_id}/labour",
    response_model=DprLabourRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*_FIELD_ROLES))],
)
async def add_labour(
    header_id: uuid.UUID, data: DprLabourCreate, session: SessionDep, current_user: CurrentUserDep
) -> DprLabourRead:
    from app.models.worker import Worker as WorkerModel
    entry = await DprService(session).add_labour(header_id, data, actor_id=uuid.UUID(current_user.id))
    worker = await session.get(WorkerModel, entry.worker_id)
    return DprLabourRead(
        id=entry.id,
        dpr_header_id=entry.dpr_header_id,
        worker_id=entry.worker_id,
        worker_name=worker.full_name if worker else "Unknown",
        worker_type=worker.worker_type if worker else "NORMAL",
        wage_unit=worker.wage_unit if worker else None,
        quantity=entry.quantity,
        rate=entry.rate,
        amount=entry.amount,
        overtime_amount=entry.overtime_amount,
        contractor_workers_count=entry.contractor_workers_count,
        remarks=entry.remarks,
    )


@router.patch(
    "/labour/{item_id}",
    response_model=DprLabourRead,
    dependencies=[Depends(require_role(*_FIELD_ROLES))],
)
async def update_labour(
    item_id: uuid.UUID, data: DprLabourUpdate, session: SessionDep, current_user: CurrentUserDep
) -> DprLabourRead:
    from app.models.worker import Worker as WorkerModel
    entry = await DprService(session).update_labour(item_id, data, actor_id=uuid.UUID(current_user.id))
    worker = await session.get(WorkerModel, entry.worker_id)
    return DprLabourRead(
        id=entry.id,
        dpr_header_id=entry.dpr_header_id,
        worker_id=entry.worker_id,
        worker_name=worker.full_name if worker else "Unknown",
        worker_type=worker.worker_type if worker else "NORMAL",
        wage_unit=worker.wage_unit if worker else None,
        quantity=entry.quantity,
        rate=entry.rate,
        amount=entry.amount,
        overtime_amount=entry.overtime_amount,
        contractor_workers_count=entry.contractor_workers_count,
        remarks=entry.remarks,
    )


@router.delete(
    "/labour/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(*_FIELD_ROLES))],
)
async def delete_labour(item_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep) -> None:
    await DprService(session).delete_labour(item_id, actor_id=uuid.UUID(current_user.id))


@router.get("/{header_id}/measurements", response_model=list[MeasurementRead])
async def list_measurements_for_dpr(
    header_id: uuid.UUID, session: SessionDep, _: CurrentUserDep
) -> list[MeasurementRead]:
    """Measurements recorded on the same project + date as this DPR header."""
    header = await DprService(session).get(header_id)
    result = await session.execute(
        select(Measurement).where(
            Measurement.project_id == header.project_id,
            Measurement.measurement_date == header.report_date,
        )
    )
    measurements = list(result.scalars().all())
    if not measurements:
        return []
    user_ids = {m.recorded_by for m in measurements}
    name_result = await session.execute(select(User.id, User.full_name).where(User.id.in_(user_ids)))
    name_by_id = dict(name_result.all())
    auto_materials_map = await MeasurementService(session).get_auto_materials_map([m.id for m in measurements])
    return [
        MeasurementRead(
            id=m.id,
            project_id=m.project_id,
            boq_item_id=m.boq_item_id,
            work_type_id=m.work_type_id,
            measurement_date=m.measurement_date,
            dimensions=m.dimensions,
            computed_qty=m.computed_qty,
            status=m.status,
            recorded_by=m.recorded_by,
            recorded_by_name=name_by_id.get(m.recorded_by, "Unknown"),
            version=m.version,
            superseded_by_id=m.superseded_by_id,
            billed=m.billed,
            chainage=m.chainage,
            rate=m.rate,
            boq_template_id=m.boq_template_id,
            boq_template_name=m.boq_template_name,
            notes=m.notes,
            auto_materials=auto_materials_map.get(m.id, []),
        )
        for m in measurements
    ]


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
