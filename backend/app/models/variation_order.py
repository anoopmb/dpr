import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class VariationOrderStatus(StrEnum):
    ACTIVE = "ACTIVE"
    SUPERSEDED = "SUPERSEDED"


class VariationOrder(TimestampedBase):
    __tablename__ = "variation_orders"
    __table_args__ = (
        CheckConstraint("additional_qty > 0", name="ck_vo_additional_qty_positive"),
        UniqueConstraint("boq_item_id", "vo_number", name="uq_vo_boq_item_number"),
    )

    boq_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("boq_items.id", ondelete="RESTRICT"), nullable=False
    )
    vo_number: Mapped[str] = mapped_column(String(50), nullable=False)
    additional_qty: Mapped[Decimal] = mapped_column(Numeric(14, 3), nullable=False)
    reason: Mapped[str] = mapped_column(String, nullable=False)
    approved_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[VariationOrderStatus] = mapped_column(
        String(20), nullable=False, default=VariationOrderStatus.ACTIVE
    )
