import uuid
from datetime import date
from decimal import Decimal
from enum import StrEnum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TimestampedBase

if TYPE_CHECKING:
    from app.models.boq import BoqItem


class ProjectStatus(StrEnum):
    ACTIVE = "ACTIVE"
    COMPLETED = "COMPLETED"
    SUSPENDED = "SUSPENDED"


class Project(TimestampedBase):
    __tablename__ = "projects"
    __table_args__ = (
        CheckConstraint("completion_date > start_date", name="ck_project_completion_after_start"),
    )

    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="RESTRICT"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    tender_no: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    agreement_no: Mapped[str | None] = mapped_column(String(100))
    contract_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    completion_date: Mapped[date] = mapped_column(Date, nullable=False)

    site_engineer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    project_manager_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    site_latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    site_longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    geofence_radius_meters: Mapped[int] = mapped_column(Integer, nullable=False, default=500)

    # Settings-page toggles, independently configurable: when either is
    # True, attendance check-in must go through the per-worker verified
    # flow and capture that piece (photo and/or GPS fix). Only when BOTH
    # are False can supervisors mark workers present in bulk with neither —
    # the act of adding a worker for the day can itself mark them present.
    attendance_photo_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    attendance_gps_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # When False (the default), field screens (DPR, Materials, Machinery,
    # Measurements) no longer require the user to have marked attendance
    # first — the RequireAttendance gate is bypassed. Flip on per project to
    # restore the "mark attendance before entering data" workflow.
    attendance_required_for_dpr: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    status: Mapped[ProjectStatus] = mapped_column(String(20), nullable=False, default=ProjectStatus.ACTIVE)

    boq_items: Mapped[list["BoqItem"]] = relationship(back_populates="project", cascade="all, delete-orphan")
