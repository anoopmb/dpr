import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, status

from app.api.deps import CurrentUserDep, SessionDep, require_role
from app.models.user import UserRole
from app.schemas.measurement import MeasurementActionRequest, MeasurementCreate, MeasurementRead
from app.services.measurement_service import MeasurementService

router = APIRouter(prefix="/measurements", tags=["measurements"])

_RECORDER_ROLES = (UserRole.SITE_ENGINEER, UserRole.PROJECT_MANAGER, UserRole.QUANTITY_SURVEYOR, UserRole.ADMIN)


@router.post(
    "",
    response_model=MeasurementRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*_RECORDER_ROLES))],
)
async def create_measurement(data: MeasurementCreate, session: SessionDep, current_user: CurrentUserDep) -> MeasurementRead:
    measurement = await MeasurementService(session).create(data, recorded_by=uuid.UUID(current_user.id))
    return MeasurementRead.model_validate(measurement)


@router.get("/by-project/{project_id}", response_model=list[MeasurementRead])
async def list_measurements_for_project(
    project_id: uuid.UUID, session: SessionDep, _: CurrentUserDep
) -> list[MeasurementRead]:
    measurements = await MeasurementService(session).list_for_project(project_id)
    return [MeasurementRead.model_validate(m) for m in measurements]


@router.get("/{measurement_id}", response_model=MeasurementRead)
async def get_measurement(measurement_id: uuid.UUID, session: SessionDep, _: CurrentUserDep) -> MeasurementRead:
    measurement = await MeasurementService(session).get(measurement_id)
    return MeasurementRead.model_validate(measurement)


@router.post("/{measurement_id}/submit", response_model=MeasurementRead)
async def submit_measurement(
    measurement_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep, background_tasks: BackgroundTasks
) -> MeasurementRead:
    measurement = await MeasurementService(session, background_tasks).submit(
        measurement_id, actor_id=uuid.UUID(current_user.id), actor_role=current_user.role
    )
    return MeasurementRead.model_validate(measurement)


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
    return MeasurementRead.model_validate(measurement)


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
    return MeasurementRead.model_validate(measurement)


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
    return MeasurementRead.model_validate(measurement)
