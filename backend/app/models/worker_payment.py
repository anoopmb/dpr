import uuid
from datetime import date
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import CheckConstraint, Date, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class WorkerPaymentType(StrEnum):
    ADVANCE = "ADVANCE"
    PAYMENT = "PAYMENT"
    DEDUCTION = "DEDUCTION"


class WorkerPayment(TimestampedBase):
    """Cash transactions against a worker's ledger.

    ADVANCE / PAYMENT reduce the balance we owe the worker.
    DEDUCTION increases the balance (amount added back to what they owe us).
    Earnings are derived from approved dpr_labour rows, not stored here.
    """

    __tablename__ = "worker_payments"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_worker_payment_amount_positive"),)

    worker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workers.id", ondelete="RESTRICT"), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="RESTRICT"), nullable=False
    )
    payment_date: Mapped[date] = mapped_column(Date, nullable=False)
    payment_type: Mapped[str] = mapped_column(String(20), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    remarks: Mapped[str | None] = mapped_column(String(500))
    recorded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
