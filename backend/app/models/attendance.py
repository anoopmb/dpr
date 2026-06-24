import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class AttendanceRecord(TimestampedBase):
    """Informational attendance only — feeds DPR/productivity reporting.
    No wage calculation; payroll is out of scope for this system."""

    __tablename__ = "attendance_records"
    __table_args__ = (
        CheckConstraint("gps_accuracy_meters IS NULL OR gps_accuracy_meters >= 0", name="ck_attendance_gps_accuracy_non_negative"),
        UniqueConstraint("worker_id", "attendance_date", name="uq_attendance_worker_date"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False
    )
    worker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workers.id", ondelete="RESTRICT"), nullable=False
    )
    attendance_date: Mapped[date] = mapped_column(Date, nullable=False)
    check_in_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Nullable because a project can configure attendance verification as
    # optional (Project.attendance_verification_required = False) — in
    # that mode workers are auto-marked present with no photo/GPS captured.
    photo_url: Mapped[str | None] = mapped_column(String(500))
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    gps_accuracy_meters: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    location_name: Mapped[str | None] = mapped_column(String(500))
    within_geofence: Mapped[bool] = mapped_column(Boolean, nullable=False)
    marked_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
