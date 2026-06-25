import uuid
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import Boolean, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class WorkerType(StrEnum):
    NORMAL = "NORMAL"
    CONTRACTOR = "CONTRACTOR"
    SUBCONTRACTOR = "SUBCONTRACTOR"


class Worker(TimestampedBase):
    """Named worker master per site — feeds Attendance and DPR labour costing."""

    __tablename__ = "workers"
    __table_args__ = (
        UniqueConstraint("project_id", "phone", name="uq_worker_project_phone"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False
    )
    worker_category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("worker_category_master.id", ondelete="RESTRICT"), nullable=False
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20))
    photo_url: Mapped[str | None] = mapped_column(String(500))
    contractor_name: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Worker type drives how DPR labour cost is computed:
    # NORMAL → quantity = days (DAY) or hours (HOUR) × rate
    # CONTRACTOR/SUBCONTRACTOR → quantity = work unit (CUM, SQM, …) × contracted rate
    worker_type: Mapped[str] = mapped_column(String(20), nullable=False, default=WorkerType.NORMAL)
    # DAY, HOUR, CUM, SQM, RM, etc. — stored as a plain string so NORMAL and
    # contractor units live in the same column without needing a UOM FK join.
    wage_unit: Mapped[str | None] = mapped_column(String(20))
    # Per-worker rate override; falls back to WorkerCategoryMaster.daily_rate if null.
    default_rate: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
