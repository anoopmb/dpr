import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TimestampedBase


class DprStatus(StrEnum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"


class DprHeader(TimestampedBase):
    __tablename__ = "dpr_headers"
    __table_args__ = (UniqueConstraint("project_id", "report_date", name="uq_dpr_project_date"),)

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False
    )
    report_date: Mapped[date] = mapped_column(Date, nullable=False)
    weather: Mapped[str | None] = mapped_column(String(100))
    daily_work_summary: Mapped[str | None] = mapped_column(String(500))
    supervisor_name: Mapped[str | None] = mapped_column(String(200))
    no_work: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    no_work_reason: Mapped[str | None] = mapped_column(String(200))
    submitted_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[DprStatus] = mapped_column(String(20), nullable=False, default=DprStatus.DRAFT)

    work_items: Mapped[list["DprWorkItem"]] = relationship(back_populates="dpr_header", cascade="all, delete-orphan")
    issues: Mapped[list["DprIssue"]] = relationship(back_populates="dpr_header", cascade="all, delete-orphan")
    materials: Mapped[list["DprMaterial"]] = relationship(back_populates="dpr_header", cascade="all, delete-orphan")
    machinery_entries: Mapped[list["DprMachinery"]] = relationship(
        back_populates="dpr_header", cascade="all, delete-orphan"
    )


class DprWorkItem(TimestampedBase):
    __tablename__ = "dpr_work_items"
    __table_args__ = (CheckConstraint("qty_today > 0", name="ck_dpr_work_item_qty_positive"),)

    dpr_header_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dpr_headers.id", ondelete="CASCADE"), nullable=False
    )
    boq_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("boq_items.id", ondelete="RESTRICT"), nullable=False
    )
    qty_today: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    notes: Mapped[str | None] = mapped_column(String(500))

    dpr_header: Mapped["DprHeader"] = relationship(back_populates="work_items")


class IssueSeverity(StrEnum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class IssueStatus(StrEnum):
    OPEN = "OPEN"
    RESOLVED = "RESOLVED"


class DprIssue(TimestampedBase):
    __tablename__ = "dpr_issues"

    dpr_header_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dpr_headers.id", ondelete="CASCADE"), nullable=False
    )
    description: Mapped[str] = mapped_column(String(1000), nullable=False)
    severity: Mapped[IssueSeverity] = mapped_column(String(20), nullable=False)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    status: Mapped[IssueStatus] = mapped_column(String(20), nullable=False, default=IssueStatus.OPEN)
    photo_url: Mapped[str | None] = mapped_column(String(500))

    dpr_header: Mapped["DprHeader"] = relationship(back_populates="issues")


class DprMaterial(TimestampedBase):
    __tablename__ = "dpr_materials"
    __table_args__ = (CheckConstraint("qty_consumed > 0", name="ck_dpr_material_qty_positive"),)

    dpr_header_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dpr_headers.id", ondelete="CASCADE"), nullable=False
    )
    material_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("material_master.id", ondelete="RESTRICT"), nullable=False
    )
    qty_consumed: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    uom_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("uom_master.id", ondelete="RESTRICT"), nullable=False
    )

    dpr_header: Mapped["DprHeader"] = relationship(back_populates="materials")


class DprMachinery(TimestampedBase):
    __tablename__ = "dpr_machinery"
    __table_args__ = (
        CheckConstraint("hours_used > 0 AND hours_used <= 24", name="ck_dpr_machinery_hours_range"),
    )

    dpr_header_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dpr_headers.id", ondelete="CASCADE"), nullable=False
    )
    machinery_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("machinery_master.id", ondelete="RESTRICT"), nullable=False
    )
    hours_used: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)

    dpr_header: Mapped["DprHeader"] = relationship(back_populates="machinery_entries")


class DprProductionEntry(TimestampedBase):
    __tablename__ = "dpr_production_entries"
    __table_args__ = (
        UniqueConstraint("dpr_header_id", "boq_item_id", name="uq_dpr_production_entry"),
    )

    dpr_header_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("dpr_headers.id", ondelete="CASCADE"), nullable=False
    )
    boq_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("boq_items.id", ondelete="RESTRICT"), nullable=False
    )
    qty_today: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    amount_today: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    chainage: Mapped[str | None] = mapped_column(String(100))
    remarks: Mapped[str | None] = mapped_column(String(500))
