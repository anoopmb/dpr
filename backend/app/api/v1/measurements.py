import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, status
from sqlalchemy import select

from app.api.deps import CurrentUserDep, SessionDep, require_role
from app.models.measurement import Measurement, MeasurementApproval
from app.models.user import User, UserRole
from app.schemas.measurement import (
    MeasurementActionRequest,
    MeasurementApprovalRead,
    MeasurementCreate,
    MeasurementRead,
    MeasurementUpdate,
)
from app.services.measurement_service import MeasurementService

router = APIRouter(prefix="/measurements", tags=["measurements"])

_RECORDER_ROLES = (UserRole.SITE_ENGINEER, UserRole.PROJECT_MANAGER, UserRole.QUANTITY_SURVEYOR, UserRole.ADMIN)


async def _to_read(session: SessionDep, measurement: Measurement) -> MeasurementRead:
    user = await session.get(User, measurement.recorded_by)
    return MeasurementRead(
        id=measurement.id,
        project_id=measurement.project_id,
        boq_item_id=measurement.boq_item_id,
        work_type_id=measurement.work_type_id,
        measurement_date=measurement.measurement_date,
        dimensions=measurement.dimensions,
        computed_qty=measurement.computed_qty,
        status=measurement.status,
        recorded_by=measurement.recorded_by,
        recorded_by_name=user.full_name if user else "Unknown",
        version=measurement.version,
        superseded_by_id=measurement.superseded_by_id,
        billed=measurement.billed,
        chainage=measurement.chainage,
    )


async def _to_read_many(session: SessionDep, measurements: list[Measurement]) -> list[MeasurementRead]:
    """Batches the recorded-by name lookup into one query instead of one
    per row — list_for_project can return a large number of rows."""
    user_ids = {m.recorded_by for m in measurements}
    if not user_ids:
        return []
    result = await session.execute(select(User.id, User.full_name).where(User.id.in_(user_ids)))
    name_by_id = dict(result.all())
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
        )
        for m in measurements
    ]


@router.post(
    "",
    response_model=MeasurementRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*_RECORDER_ROLES))],
)
async def create_measurement(data: MeasurementCreate, session: SessionDep, current_user: CurrentUserDep) -> MeasurementRead:
    measurement = await MeasurementService(session).create(data, recorded_by=uuid.UUID(current_user.id))
    return await _to_read(session, measurement)


@router.get("/by-project/{project_id}", response_model=list[MeasurementRead])
async def list_measurements_for_project(
    project_id: uuid.UUID, session: SessionDep, _: CurrentUserDep
) -> list[MeasurementRead]:
    measurements = await MeasurementService(session).list_for_project(project_id)
    return await _to_read_many(session, measurements)


@router.get("/{measurement_id}", response_model=MeasurementRead)
async def get_measurement(measurement_id: uuid.UUID, session: SessionDep, _: CurrentUserDep) -> MeasurementRead:
    measurement = await MeasurementService(session).get(measurement_id)
    return await _to_read(session, measurement)


@router.get("/{measurement_id}/approvals", response_model=list[MeasurementApprovalRead])
async def list_measurement_approvals(
    measurement_id: uuid.UUID, session: SessionDep, _: CurrentUserDep
) -> list[MeasurementApprovalRead]:
    """Full chronological status-transition history for one measurement —
    who acted, what changed, and any remarks (e.g. a rejection reason)."""
    result = await session.execute(
        select(MeasurementApproval, User.full_name)
        .join(User, MeasurementApproval.acted_by == User.id)
        .where(MeasurementApproval.measurement_id == measurement_id)
        .order_by(MeasurementApproval.acted_at)
    )
    return [
        MeasurementApprovalRead(
            id=approval.id,
            measurement_id=approval.measurement_id,
            from_status=approval.from_status,
            to_status=approval.to_status,
            acted_by=approval.acted_by,
            actor_name=full_name,
            remarks=approval.remarks,
            acted_at=approval.acted_at,
        )
        for approval, full_name in result.all()
    ]


@router.post("/{measurement_id}/submit", response_model=MeasurementRead)
async def submit_measurement(
    measurement_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep, background_tasks: BackgroundTasks
) -> MeasurementRead:
    measurement = await MeasurementService(session, background_tasks).submit(
        measurement_id, actor_id=uuid.UUID(current_user.id), actor_role=current_user.role
    )
    return await _to_read(session, measurement)


@router.post("/{measurement_id}/approve", response_model=MeasurementRead)
async def approve_measurement(
    measurement_id: uuid.UUID,
    data: MeasurementActionRequest,
    session: SessionDep,
    current_user: CurrentUserDep,
    background_tasks: BackgroundTasks,
) -> MeasurementRead:
    measurement = await MeasurementService(session, background_tasks).approve(
        measurement_id, actor_id=uuid.UUID(current_user.id), actor_role=current_user.role, data=data
    )
    return await _to_read(session, measurement)


@router.post("/{measurement_id}/reject", response_model=MeasurementRead)
async def reject_measurement(
    measurement_id: uuid.UUID,
    data: MeasurementActionRequest,
    session: SessionDep,
    current_user: CurrentUserDep,
    background_tasks: BackgroundTasks,
) -> MeasurementRead:
    measurement = await MeasurementService(session, background_tasks).reject(
        measurement_id, actor_id=uuid.UUID(current_user.id), actor_role=current_user.role, data=data
    )
    return await _to_read(session, measurement)


@router.post("/{measurement_id}/lock", response_model=MeasurementRead)
async def lock_measurement(
    measurement_id: uuid.UUID,
    data: MeasurementActionRequest,
    session: SessionDep,
    current_user: CurrentUserDep,
    background_tasks: BackgroundTasks,
) -> MeasurementRead:
    measurement = await MeasurementService(session, background_tasks).lock(
        measurement_id, actor_id=uuid.UUID(current_user.id), actor_role=current_user.role, data=data
    )
    return await _to_read(session, measurement)


@router.patch(
    "/{measurement_id}",
    response_model=MeasurementRead,
    dependencies=[Depends(require_role(*_RECORDER_ROLES))],
)
async def update_measurement(
    measurement_id: uuid.UUID, data: MeasurementUpdate, session: SessionDep, current_user: CurrentUserDep
) -> MeasurementRead:
    measurement = await MeasurementService(session).update(
        measurement_id, data, actor_id=uuid.UUID(current_user.id), actor_role=current_user.role
    )
    return await _to_read(session, measurement)


@router.delete(
    "/{measurement_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(*_RECORDER_ROLES))],
)
async def delete_measurement(
    measurement_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep
) -> None:
    await MeasurementService(session).delete(
        measurement_id, actor_id=uuid.UUID(current_user.id), actor_role=current_user.role
    )
