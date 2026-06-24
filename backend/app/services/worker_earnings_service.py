import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import AttendanceRecord
from app.models.master_data import WorkerCategoryMaster
from app.models.worker import Worker
from app.schemas.worker_earnings import (
    DailyLabourLogReportRead,
    DailyLabourLogRow,
    WorkerEarningsReportRead,
    WorkerEarningsRow,
)


class WorkerEarningsService:
    """Worker wage report: attendance days x WorkerCategoryMaster.daily_rate.
    Not a staff payroll feature — this system explicitly keeps payroll out
    of scope (see Worker/AttendanceRecord model docstrings); this is purely
    a read-only costing report over data that already exists."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_report(
        self,
        project_id: uuid.UUID,
        from_date: date,
        to_date: date,
        worker_category_id: uuid.UUID | None = None,
    ) -> WorkerEarningsReportRead:
        query = (
            select(
                Worker.id,
                Worker.full_name,
                WorkerCategoryMaster.id,
                WorkerCategoryMaster.name,
                WorkerCategoryMaster.daily_rate,
                func.count(AttendanceRecord.id).label("days_present"),
            )
            .join(AttendanceRecord, AttendanceRecord.worker_id == Worker.id)
            .join(WorkerCategoryMaster, Worker.worker_category_id == WorkerCategoryMaster.id)
            .where(AttendanceRecord.project_id == project_id)
            .where(AttendanceRecord.attendance_date >= from_date)
            .where(AttendanceRecord.attendance_date <= to_date)
            .group_by(Worker.id, Worker.full_name, WorkerCategoryMaster.id, WorkerCategoryMaster.name, WorkerCategoryMaster.daily_rate)
            .order_by(Worker.full_name)
        )
        if worker_category_id is not None:
            query = query.where(Worker.worker_category_id == worker_category_id)

        result = await self.session.execute(query)

        rows: list[WorkerEarningsRow] = []
        total_days = 0
        total_earnings = Decimal("0.00")

        for worker_id, worker_name, category_id, category_name, daily_rate, days_present in result:
            earnings = (daily_rate * days_present).quantize(Decimal("0.01")) if daily_rate is not None else None
            rows.append(
                WorkerEarningsRow(
                    worker_id=worker_id,
                    worker_name=worker_name,
                    category_id=category_id,
                    category_name=category_name,
                    days_present=days_present,
                    daily_rate=daily_rate,
                    total_earnings=earnings,
                )
            )
            total_days += days_present
            if earnings is not None:
                total_earnings += earnings

        return WorkerEarningsReportRead(
            project_id=project_id,
            from_date=from_date,
            to_date=to_date,
            rows=rows,
            total_days_present=total_days,
            total_earnings=total_earnings,
        )

    async def get_daily_log(
        self,
        project_id: uuid.UUID,
        from_date: date,
        to_date: date,
        worker_category_id: uuid.UUID | None = None,
    ) -> DailyLabourLogReportRead:
        """Day-by-day labour ledger: one row per (date, worker) actually
        present — there's no separate 'absent' row since AttendanceRecord
        only stores presence, not absence."""
        query = (
            select(
                AttendanceRecord.attendance_date,
                Worker.id,
                Worker.full_name,
                WorkerCategoryMaster.id,
                WorkerCategoryMaster.name,
                WorkerCategoryMaster.daily_rate,
            )
            .join(Worker, AttendanceRecord.worker_id == Worker.id)
            .join(WorkerCategoryMaster, Worker.worker_category_id == WorkerCategoryMaster.id)
            .where(AttendanceRecord.project_id == project_id)
            .where(AttendanceRecord.attendance_date >= from_date)
            .where(AttendanceRecord.attendance_date <= to_date)
            .order_by(AttendanceRecord.attendance_date, Worker.full_name)
        )
        if worker_category_id is not None:
            query = query.where(Worker.worker_category_id == worker_category_id)

        result = await self.session.execute(query)

        rows: list[DailyLabourLogRow] = []
        total_cost = Decimal("0.00")

        for attendance_date, worker_id, worker_name, category_id, category_name, daily_rate in result:
            cost = daily_rate.quantize(Decimal("0.01")) if daily_rate is not None else None
            rows.append(
                DailyLabourLogRow(
                    attendance_date=attendance_date,
                    worker_id=worker_id,
                    worker_name=worker_name,
                    category_id=category_id,
                    category_name=category_name,
                    daily_rate=daily_rate,
                    cost=cost,
                )
            )
            if cost is not None:
                total_cost += cost

        return DailyLabourLogReportRead(
            project_id=project_id,
            from_date=from_date,
            to_date=to_date,
            rows=rows,
            total_cost=total_cost,
        )
