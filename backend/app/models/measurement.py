import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class MeasurementStatus(StrEnum):
    """The four fixed, built-in statuses. Everything in between DRAFT/SUBMITTED
    and REJECTED/LOCKED is a configurable approval level (see
    app.services.workflow_config_service) — those status codes are admin-
    defined strings, not members of this enum, so `Measurement.status` is a
    plain string column, not constrained to this enum's values."""

    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    REJECTED = "REJECTED"
    LOCKED = "LOCKED"


class Measurement(TimestampedBase):
    """Measurement Book entry. LOCKED rows are immutable at the service
    layer — amendments insert a new row and set superseded_by_id on the
    old one rather than mutating an approved measurement."""

    __tablename__ = "measurements"
    __table_args__ = (CheckConstraint("computed_qty > 0", name="ck_measurement_computed_qty_positive"),)

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False
    )
    boq_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("boq_items.id", ondelete="RESTRICT"), nullable=False
    )
    work_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_type_master.id", ondelete="RESTRICT"), nullable=False
    )
    measurement_date: Mapped[date] = mapped_column(Date, nullable=False)
    dimensions: Mapped[dict] = mapped_column(JSONB, nullable=False)
    computed_qty: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    # Plain string, not constrained to MeasurementStatus — holds either a
    # fixed bookend (DRAFT/SUBMITTED/REJECTED/LOCKED) or an admin-configured
    # approval level's status_code (see app.models.workflow_config).
    status: Mapped[str] = mapped_column(String(50), nullable=False, default=MeasurementStatus.DRAFT.value)
    recorded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    superseded_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("measurements.id", ondelete="SET NULL")
    )
    billed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    chainage: Mapped[str | None] = mapped_column(String(100), nullable=True)
    rate: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)


class MeasurementApproval(TimestampedBase):
    """Append-only approval audit trail."""

    __tablename__ = "measurement_approvals"

    measurement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("measurements.id", ondelete="CASCADE"), nullable=False
    )
    from_status: Mapped[str] = mapped_column(String(30), nullable=False)
    to_status: Mapped[str] = mapped_column(String(30), nullable=False)
    acted_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    remarks: Mapped[str | None] = mapped_column(String(500))
    acted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
