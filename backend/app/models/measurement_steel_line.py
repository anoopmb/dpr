import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TimestampedBase

if TYPE_CHECKING:
    from app.models.measurement import Measurement


class MeasurementSteelLine(TimestampedBase):
    __tablename__ = "measurement_steel_lines"

    measurement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("measurements.id", ondelete="CASCADE"), nullable=False
    )
    description: Mapped[str | None] = mapped_column(String(200), nullable=True)
    diameter_mm: Mapped[int] = mapped_column(Integer, nullable=False)
    bar_count: Mapped[Decimal] = mapped_column(Numeric(10, 0), nullable=False)
    length_m: Mapped[Decimal] = mapped_column(Numeric(10, 3), nullable=False)
    coefficient: Mapped[Decimal] = mapped_column(Numeric(10, 6), nullable=False)
    computed_weight_mt: Mapped[Decimal] = mapped_column(Numeric(14, 6), nullable=False)

    measurement: Mapped["Measurement"] = relationship(back_populates="steel_lines")
