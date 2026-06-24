import uuid
from enum import StrEnum

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class StockLocationType(StrEnum):
    HEAD_OFFICE = "HEAD_OFFICE"
    SITE = "SITE"


class StockLocation(TimestampedBase):
    """Head Office store (project_id NULL) or a project's own site store —
    the two possible fulfillment sources for a material indent."""

    __tablename__ = "stock_locations"
    __table_args__ = (
        CheckConstraint(
            "(location_type = 'HEAD_OFFICE' AND project_id IS NULL) OR "
            "(location_type = 'SITE' AND project_id IS NOT NULL)",
            name="ck_stock_location_project_matches_type",
        ),
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    location_type: Mapped[StockLocationType] = mapped_column(String(20), nullable=False)
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="RESTRICT")
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
