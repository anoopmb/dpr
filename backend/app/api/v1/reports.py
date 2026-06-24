import uuid
from datetime import date

from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentUserDep, SessionDep, require_role
from app.models.user import UserRole
from app.schemas.worker_earnings import DailyLabourLogReportRead, WorkerEarningsReportRead
from app.services.worker_earnings_service import WorkerEarningsService

router = APIRouter(prefix="/reports", tags=["reports"])

_REPORT_ROLES = (UserRole.PROJECT_MANAGER, UserRole.QUANTITY_SURVEYOR, UserRole.ADMIN)


@router.get(
    "/worker-earnings",
    response_model=WorkerEarningsReportRead,
    dependencies=[Depends(require_role(*_REPORT_ROLES))],
)
async def get_worker_earnings_report(
    session: SessionDep,
    _: CurrentUserDep,
    project_id: uuid.UUID,
    from_date: date = Query(...),
    to_date: date = Query(...),
    worker_category_id: uuid.UUID | None = Query(default=None),
) -> WorkerEarningsReportRead:
    return await WorkerEarningsService(session).get_report(project_id, from_date, to_date, worker_category_id)


@router.get(
    "/daily-labour-log",
    response_model=DailyLabourLogReportRead,
    dependencies=[Depends(require_role(*_REPORT_ROLES))],
)
async def get_daily_labour_log(
    session: SessionDep,
    _: CurrentUserDep,
    project_id: uuid.UUID,
    from_date: date = Query(...),
    to_date: date = Query(...),
    worker_category_id: uuid.UUID | None = Query(default=None),
) -> DailyLabourLogReportRead:
    return await WorkerEarningsService(session).get_daily_log(project_id, from_date, to_date, worker_category_id)
