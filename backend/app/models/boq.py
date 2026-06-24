import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TimestampedBase

if TYPE_CHECKING:
    from app.models.project import Project


class BoqSection(TimestampedBase):
    __tablename__ = "boq_sections"
    __table_args__ = (
        UniqueConstraint("project_id", "section_no", name="uq_boq_section_project_no"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    section_no: Mapped[str] = mapped_column(String(10), nullable=False)
    section_name: Mapped[str] = mapped_column(String(200), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class BoqItem(TimestampedBase):
    __tablename__ = "boq_items"
    __table_args__ = (
        CheckConstraint("tendered_qty > 0", name="ck_boq_tendered_qty_positive"),
        CheckConstraint("consumed_qty >= 0", name="ck_boq_consumed_qty_non_negative"),
        CheckConstraint("rate >= 0", name="ck_boq_rate_non_negative"),
        UniqueConstraint("project_id", "item_no", name="uq_boq_project_item_no"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False
    )
    section_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("boq_sections.id", ondelete="SET NULL"), nullable=True
    )
    work_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_type_master.id", ondelete="RESTRICT"), nullable=False
    )
    uom_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("uom_master.id", ondelete="RESTRICT"), nullable=False
    )
    item_no: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    tendered_qty: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    consumed_qty: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False, default=0)
    rate: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    has_active_variation_order: Mapped[bool] = mapped_column(default=False)

    project: Mapped["Project"] = relationship(back_populates="boq_items")
