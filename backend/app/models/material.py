import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TimestampedBase
from app.models.stock_location import StockLocationType


class MaterialIndentStatus(StrEnum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    ISSUED = "ISSUED"
    PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED"
    RECEIVED = "RECEIVED"
    CANCELLED = "CANCELLED"


class MaterialIndent(TimestampedBase):
    """Internal stock request header — no procurement. Fulfilled either by
    the Head Office store or by transfer from another site."""

    __tablename__ = "material_indents"

    requesting_project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False
    )
    source_type: Mapped[StockLocationType] = mapped_column(String(20), nullable=False)
    source_location_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("stock_locations.id", ondelete="RESTRICT"), nullable=False
    )
    requested_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    status: Mapped[MaterialIndentStatus] = mapped_column(
        String(20), nullable=False, default=MaterialIndentStatus.DRAFT
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    needed_by_date: Mapped[date | None] = mapped_column(Date)

    items: Mapped[list["MaterialIndentItem"]] = relationship(
        back_populates="indent", cascade="all, delete-orphan"
    )


class MaterialIndentItem(TimestampedBase):
    __tablename__ = "material_indent_items"
    __table_args__ = (
        CheckConstraint("requested_qty > 0", name="ck_indent_item_requested_qty_positive"),
        CheckConstraint("issued_qty >= 0", name="ck_indent_item_issued_qty_non_negative"),
        CheckConstraint("received_qty >= 0", name="ck_indent_item_received_qty_non_negative"),
        CheckConstraint("issued_qty <= requested_qty", name="ck_indent_item_issued_le_requested"),
        CheckConstraint("received_qty <= issued_qty", name="ck_indent_item_received_le_issued"),
    )

    material_indent_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("material_indents.id", ondelete="CASCADE"), nullable=False
    )
    material_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("material_master.id", ondelete="RESTRICT"), nullable=False
    )
    uom_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("uom_master.id", ondelete="RESTRICT"), nullable=False
    )
    requested_qty: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    issued_qty: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False, default=0)
    received_qty: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False, default=0)

    indent: Mapped["MaterialIndent"] = relationship(back_populates="items")


class MaterialIssue(TimestampedBase):
    """Append-only fulfillment ledger."""

    __tablename__ = "material_issues"
    __table_args__ = (CheckConstraint("issued_qty > 0", name="ck_issue_qty_positive"),)

    material_indent_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("material_indent_items.id", ondelete="RESTRICT"), nullable=False
    )
    issued_qty: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    issued_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    vehicle_ref: Mapped[str | None] = mapped_column(String(100))


class MaterialReceipt(TimestampedBase):
    """Append-only site-confirmation ledger."""

    __tablename__ = "material_receipts"
    __table_args__ = (CheckConstraint("received_qty > 0", name="ck_receipt_qty_positive"),)

    material_indent_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("material_indent_items.id", ondelete="RESTRICT"), nullable=False
    )
    received_qty: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    received_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    photo_url: Mapped[str | None] = mapped_column(String(500))
    remarks: Mapped[str | None] = mapped_column(String(500))
