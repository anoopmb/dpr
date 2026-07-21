import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class ProjectCompletionExtension(TimestampedBase):
    """Append-only audit trail of completion-date extensions. Each row records
    one extension: the date the project moved from and to, why, and by whom.
    The project's own completion_date always reflects the latest extension;
    this table preserves the full history so extensions can be revisited."""

    __tablename__ = "project_completion_extensions"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    previous_completion_date: Mapped[date] = mapped_column(Date, nullable=False)
    new_completion_date: Mapped[date] = mapped_column(Date, nullable=False)
    reason: Mapped[str | None] = mapped_column(String(500))
    extended_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    extended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
