import uuid
from datetime import date
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import CheckConstraint, Date, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TimestampedBase


class BillStatus(StrEnum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    PAID = "PAID"


class RunningBill(TimestampedBase):
    """Bill raised to the client/government — never a vendor bill."""

    __tablename__ = "running_bills"
    __table_args__ = (
        CheckConstraint("to_date >= from_date", name="ck_bill_to_date_after_from_date"),
        CheckConstraint("total_amount >= 0", name="ck_bill_total_amount_non_negative"),
        UniqueConstraint("project_id", "bill_number", name="uq_bill_project_number"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False
    )
    bill_number: Mapped[str] = mapped_column(String(50), nullable=False)
    bill_date: Mapped[date] = mapped_column(Date, nullable=False)
    from_date: Mapped[date] = mapped_column(Date, nullable=False)
    to_date: Mapped[date] = mapped_column(Date, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(16, 2), nullable=False, default=0)
    status: Mapped[BillStatus] = mapped_column(String(20), nullable=False, default=BillStatus.DRAFT)
    idempotency_key: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    generated_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    items: Mapped[list["RunningBillItem"]] = relationship(back_populates="running_bill", cascade="all, delete-orphan")
    payments: Mapped[list["PaymentReceived"]] = relationship(
        back_populates="running_bill", cascade="all, delete-orphan"
    )


class RunningBillItem(TimestampedBase):
    __tablename__ = "running_bill_items"
    __table_args__ = (
        CheckConstraint("billed_qty > 0", name="ck_bill_item_qty_positive"),
        CheckConstraint("rate >= 0", name="ck_bill_item_rate_non_negative"),
        CheckConstraint("amount >= 0", name="ck_bill_item_amount_non_negative"),
        UniqueConstraint("running_bill_id", "measurement_id", name="uq_bill_item_measurement"),
    )

    running_bill_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("running_bills.id", ondelete="CASCADE"), nullable=False
    )
    measurement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("measurements.id", ondelete="RESTRICT"), nullable=False
    )
    boq_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("boq_items.id", ondelete="RESTRICT"), nullable=False
    )
    billed_qty: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    rate: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(16, 2), nullable=False)

    running_bill: Mapped["RunningBill"] = relationship(back_populates="items")


class PaymentReceived(TimestampedBase):
    """Payment from the client/government against a running bill — never a
    vendor payment."""

    __tablename__ = "payments_received"
    __table_args__ = (CheckConstraint("amount_received > 0", name="ck_payment_amount_positive"),)

    running_bill_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("running_bills.id", ondelete="RESTRICT"), nullable=False
    )
    amount_received: Mapped[Decimal] = mapped_column(Numeric(16, 2), nullable=False)
    received_date: Mapped[date] = mapped_column(Date, nullable=False)
    reference_no: Mapped[str | None] = mapped_column(String(100))
    recorded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    running_bill: Mapped["RunningBill"] = relationship(back_populates="payments")
