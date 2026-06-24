import uuid
from datetime import date

from sqlalchemy import select

from app.models.attendance import AttendanceRecord
from app.repositories.base import BaseRepository


class AttendanceRepository(BaseRepository[AttendanceRecord]):
    model = AttendanceRecord

    async def get_for_worker_and_date(self, worker_id: uuid.UUID, attendance_date: date) -> AttendanceRecord | None:
        result = await self.session.execute(
            select(AttendanceRecord).where(
                AttendanceRecord.worker_id == worker_id, AttendanceRecord.attendance_date == attendance_date
            )
        )
        return result.scalar_one_or_none()

    async def list_for_project(self, project_id: uuid.UUID, attendance_date: date | None = None) -> list[AttendanceRecord]:
        stmt = select(AttendanceRecord).where(AttendanceRecord.project_id == project_id)
        if attendance_date is not None:
            stmt = stmt.where(AttendanceRecord.attendance_date == attendance_date)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
