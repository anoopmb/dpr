import uuid
from datetime import date

from fastapi import APIRouter, Depends, status

from app.api.deps import CurrentUserDep, SessionDep, require_role
from app.models.user import UserRole
from app.schemas.attendance import (
    AttendanceCheckInCreate,
    AttendanceRecordRead,
    MarkPresentRequest,
    WorkerCreate,
    WorkerRead,
    WorkerUpdate,
)
from app.services.attendance_service import AttendanceService, WorkerService

router = APIRouter(tags=["attendance"])

_SUPERVISOR_ROLES = (UserRole.SITE_ENGINEER, UserRole.PROJECT_MANAGER, UserRole.ADMIN)


@router.post(
    "/workers",
    response_model=WorkerRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*_SUPERVISOR_ROLES))],
)
async def create_worker(data: WorkerCreate, session: SessionDep, current_user: CurrentUserDep) -> WorkerRead:
    worker = await WorkerService(session).create(
        data, marked_by=uuid.UUID(current_user.id), actor_role=current_user.role
    )
    return WorkerRead.model_validate(worker)


@router.patch(
    "/workers/{worker_id}",
    response_model=WorkerRead,
    dependencies=[Depends(require_role(*_SUPERVISOR_ROLES))],
)
async def update_worker(
    worker_id: uuid.UUID, data: WorkerUpdate, session: SessionDep, current_user: CurrentUserDep
) -> WorkerRead:
    worker = await WorkerService(session).update(worker_id, data, actor_id=uuid.UUID(current_user.id))
    return WorkerRead.model_validate(worker)


@router.get("/workers/by-project/{project_id}", response_model=list[WorkerRead])
async def list_workers_for_project(project_id: uuid.UUID, session: SessionDep, _: CurrentUserDep) -> list[WorkerRead]:
    workers = await WorkerService(session).list_for_project(project_id)
    return [WorkerRead.model_validate(w) for w in workers]


@router.post(
    "/attendance/check-in",
    response_model=AttendanceRecordRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*_SUPERVISOR_ROLES))],
)
async def check_in(data: AttendanceCheckInCreate, session: SessionDep, current_user: CurrentUserDep) -> AttendanceRecordRead:
    record = await AttendanceService(session).check_in(
        data, marked_by=uuid.UUID(current_user.id), actor_role=current_user.role
    )
    return AttendanceRecordRead.model_validate(record)


@router.post(
    "/attendance/mark-present",
    response_model=list[AttendanceRecordRead],
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*_SUPERVISOR_ROLES))],
)
async def mark_present(
    data: MarkPresentRequest, session: SessionDep, current_user: CurrentUserDep
) -> list[AttendanceRecordRead]:
    records = await AttendanceService(session).mark_present(
        data, marked_by=uuid.UUID(current_user.id), actor_role=current_user.role
    )
    return [AttendanceRecordRead.model_validate(r) for r in records]


@router.get("/attendance/by-project/{project_id}", response_model=list[AttendanceRecordRead])
async def list_attendance_for_project(
    project_id: uuid.UUID, session: SessionDep, _: CurrentUserDep, attendance_date: date | None = None
) -> list[AttendanceRecordRead]:
    records = await AttendanceService(session).list_for_project(project_id, attendance_date)
    return [AttendanceRecordRead.model_validate(r) for r in records]


@router.delete(
    "/attendance/records/{record_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(*_SUPERVISOR_ROLES))],
)
async def delete_attendance_record(
    record_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep
) -> None:
    await AttendanceService(session).delete(record_id, actor_id=uuid.UUID(current_user.id), actor_role=current_user.role)
