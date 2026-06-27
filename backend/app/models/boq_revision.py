import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TimestampedBase

if TYPE_CHECKING:
    from app.models.user import User


class BoqItemRevision(TimestampedBase):
    __tablename__ = "boq_item_revisions"
    __table_args__ = (
        UniqueConstraint("boq_item_id", "revision_number", name="uq_boq_revision_item_number"),
    )

    boq_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("boq_items.id", ondelete="CASCADE"), nullable=False
    )
    revision_number: Mapped[str] = mapped_column(String(20), nullable=False)
    revision_type: Mapped[str] = mapped_column(String(30), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING")
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    revised_rate: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    revised_tendered_qty: Mapped[Decimal | None] = mapped_column(Numeric(14, 3), nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    approved_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejected_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_by: Mapped["User"] = relationship(foreign_keys=[created_by_user_id])
    approved_by: Mapped["User | None"] = relationship(foreign_keys=[approved_by_user_id])
