import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import AttendanceRecord
from app.models.dpr import DprHeader
from app.models.measurement import Measurement
from app.models.project import Project
from app.schemas.activity import ActivityEntry, ActivityListRead


class ActivityService:
    """Read-only personal activity log built from existing tables — not a
    new clock-in/timesheet system. Pulls every action this user is on
    record as having performed: DPRs submitted, worker attendance marked,
    measurements recorded."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_for_user(self, user_id: uuid.UUID, limit: int = 100) -> ActivityListRead:
        entries: list[ActivityEntry] = []

        dpr_rows = await self.session.execute(
            select(DprHeader.report_date, DprHeader.project_id, Project.name)
            .join(Project, DprHeader.project_id == Project.id)
            .where(DprHeader.submitted_by == user_id)
            .order_by(DprHeader.report_date.desc())
            .limit(limit)
        )
        for report_date, project_id, project_name in dpr_rows:
            entries.append(
                ActivityEntry(
                    activity_date=report_date,
                    type="DPR_SUBMITTED",
                    description=f"Submitted DPR for {project_name}",
                    project_id=project_id,
                    project_name=project_name,
                    link_url="/dpr-history",
                )
            )

        attendance_rows = await self.session.execute(
            select(AttendanceRecord.attendance_date, AttendanceRecord.project_id, Project.name)
            .join(Project, AttendanceRecord.project_id == Project.id)
            .where(AttendanceRecord.marked_by == user_id)
            .order_by(AttendanceRecord.attendance_date.desc())
            .limit(limit)
        )
        for attendance_date, project_id, project_name in attendance_rows:
            entries.append(
                ActivityEntry(
                    activity_date=attendance_date,
                    type="ATTENDANCE_MARKED",
                    description=f"Marked worker attendance for {project_name}",
                    project_id=project_id,
                    project_name=project_name,
                    link_url="/workers",
                )
            )

        measurement_rows = await self.session.execute(
            select(Measurement.measurement_date, Measurement.project_id, Project.name)
            .join(Project, Measurement.project_id == Project.id)
            .where(Measurement.recorded_by == user_id)
            .order_by(Measurement.measurement_date.desc())
            .limit(limit)
        )
        for measurement_date, project_id, project_name in measurement_rows:
            entries.append(
                ActivityEntry(
                    activity_date=measurement_date,
                    type="MEASUREMENT_RECORDED",
                    description=f"Recorded a measurement for {project_name}",
                    project_id=project_id,
                    project_name=project_name,
                    link_url="/measurements",
                )
            )

        entries.sort(key=lambda e: e.activity_date, reverse=True)
        return ActivityListRead(items=entries[:limit])
