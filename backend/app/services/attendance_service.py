import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import DomainError, NotFoundError
from app.domain.attendance.validators import GeoPoint, is_within_geofence
from app.models.attendance import AttendanceRecord
from app.models.project import Project
from app.models.worker import Worker
from app.repositories.attendance_repo import AttendanceRepository
from app.repositories.worker_repo import WorkerRepository
from app.schemas.attendance import AttendanceCheckInCreate, MarkPresentRequest, WorkerCreate, WorkerUpdate


class AlreadyCheckedInError(DomainError):
    error_code = "ALREADY_CHECKED_IN"


class VerificationRequiredError(DomainError):
    error_code = "ATTENDANCE_VERIFICATION_REQUIRED"


async def _record_attendance(
    repo: AttendanceRepository,
    *,
    project: Project,
    worker_id: uuid.UUID,
    marked_by: uuid.UUID,
    photo_url: str | None,
    latitude: Decimal | None,
    longitude: Decimal | None,
    gps_accuracy_meters: Decimal | None,
    location_name: str | None = None,
) -> AttendanceRecord:
    """Shared by AttendanceService.check_in/mark_present and
    WorkerService.create (when a new worker is auto-marked present)."""
    today = date.today()
    existing = await repo.get_for_worker_and_date(worker_id, today)
    if existing is not None:
        raise AlreadyCheckedInError(f"Worker {worker_id} is already checked in for {today}.")

    within_geofence = True
    if (
        latitude is not None
        and longitude is not None
        and project.site_latitude is not None
        and project.site_longitude is not None
    ):
        within_geofence = is_within_geofence(
            GeoPoint(latitude=latitude, longitude=longitude),
            GeoPoint(latitude=project.site_latitude, longitude=project.site_longitude),
            project.geofence_radius_meters,
        )

    record = AttendanceRecord(
        project_id=project.id,
        worker_id=worker_id,
        attendance_date=today,
        check_in_time=datetime.now(timezone.utc),
        photo_url=photo_url,
        latitude=latitude,
        longitude=longitude,
        gps_accuracy_meters=gps_accuracy_meters,
        location_name=location_name,
        within_geofence=within_geofence,
        marked_by=marked_by,
    )
    repo.add(record)
    await repo.session.flush()
    return record


class WorkerService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = WorkerRepository(session)
        self.attendance_repo = AttendanceRepository(session)

    async def create(self, data: WorkerCreate, marked_by: uuid.UUID) -> Worker:
        worker = Worker(**data.model_dump(exclude={"mark_present_today"}))
        self.repo.add(worker)
        await self.session.flush()

        if data.mark_present_today:
            project = await self.session.get(Project, data.project_id)
            if project is None:
                raise NotFoundError(f"Project {data.project_id} not found.")
            if project.attendance_verification_required:
                raise VerificationRequiredError(
                    "This project requires photo/GPS verification — check the worker in instead of auto-marking."
                )
            await _record_attendance(
                self.attendance_repo,
                project=project,
                worker_id=worker.id,
                marked_by=marked_by,
                photo_url=None,
                latitude=None,
                longitude=None,
                gps_accuracy_meters=None,
            )

        await self.session.commit()
        await self.session.refresh(worker)
        return worker

    async def update(self, worker_id: uuid.UUID, data: WorkerUpdate) -> Worker:
        worker = await self.repo.get(worker_id)
        if worker is None:
            raise NotFoundError(f"Worker {worker_id} not found.")
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(worker, field, value)
        await self.session.commit()
        await self.session.refresh(worker)
        return worker

    async def list_for_project(self, project_id: uuid.UUID) -> list[Worker]:
        return await self.repo.list_for_project(project_id)


class AttendanceService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = AttendanceRepository(session)
        self.worker_repo = WorkerRepository(session)

    async def check_in(self, data: AttendanceCheckInCreate, marked_by: uuid.UUID) -> AttendanceRecord:
        worker = await self.worker_repo.get(data.worker_id)
        if worker is None or worker.project_id != data.project_id:
            raise NotFoundError("Worker not found for this project.")

        project = await self.session.get(Project, data.project_id)
        if project is None:
            raise NotFoundError(f"Project {data.project_id} not found.")

        if project.attendance_verification_required and (
            not data.photo_url or data.latitude is None or data.longitude is None
        ):
            raise VerificationRequiredError("This project requires a photo and GPS location to mark attendance.")

        record = await _record_attendance(
            self.repo,
            project=project,
            worker_id=data.worker_id,
            marked_by=marked_by,
            photo_url=data.photo_url,
            latitude=data.latitude,
            longitude=data.longitude,
            gps_accuracy_meters=data.gps_accuracy_meters,
            location_name=data.location_name,
        )
        await self.session.commit()
        await self.session.refresh(record)
        return record

    async def mark_present(self, data: MarkPresentRequest, marked_by: uuid.UUID) -> list[AttendanceRecord]:
        project = await self.session.get(Project, data.project_id)
        if project is None:
            raise NotFoundError(f"Project {data.project_id} not found.")
        if project.attendance_verification_required:
            raise VerificationRequiredError(
                "This project requires photo/GPS verification — use check-in instead of bulk marking."
            )

        records: list[AttendanceRecord] = []
        for worker_id in data.worker_ids:
            worker = await self.worker_repo.get(worker_id)
            if worker is None or worker.project_id != data.project_id:
                raise NotFoundError(f"Worker {worker_id} not found for this project.")

            existing = await self.repo.get_for_worker_and_date(worker_id, date.today())
            if existing is not None:
                continue  # already marked — bulk action is idempotent, not an error

            record = await _record_attendance(
                self.repo,
                project=project,
                worker_id=worker_id,
                marked_by=marked_by,
                photo_url=None,
                latitude=data.latitude,
                longitude=data.longitude,
                gps_accuracy_meters=data.gps_accuracy_meters,
                location_name=data.location_name,
            )
            records.append(record)

        await self.session.commit()
        for record in records:
            await self.session.refresh(record)
        return records

    async def list_for_project(
        self, project_id: uuid.UUID, attendance_date: date | None = None
    ) -> list[AttendanceRecord]:
        return await self.repo.list_for_project(project_id, attendance_date)
