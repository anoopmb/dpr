import uuid
from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import DateTime, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class PhotoEntityType(StrEnum):
    DPR_ISSUE = "DPR_ISSUE"
    MEASUREMENT = "MEASUREMENT"
    MATERIAL_RECEIPT = "MATERIAL_RECEIPT"
    ATTENDANCE = "ATTENDANCE"


class ProjectPhoto(TimestampedBase):
    """Polymorphic photo attachment. entity_id has no DB-level FK since it
    references different tables depending on entity_type — the matching
    target row's existence is validated in the domain/service layer."""

    __tablename__ = "project_photos"

    entity_type: Mapped[PhotoEntityType] = mapped_column(String(30), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    photo_url: Mapped[str] = mapped_column(String(500), nullable=False)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
