import uuid

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class ProjectAssignment(TimestampedBase):
    """Additive per-project role assignment. Project.project_manager_id and
    site_engineer_id remain the 'primary' assignment for backward
    compatibility; this table covers Quantity Surveyor / Store Keeper (which
    have no legacy field) and any additional PM/Site Engineer beyond the
    single primary slot."""

    __tablename__ = "project_assignments"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id", "role", name="uq_project_assignment_project_user_role"),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(30), nullable=False)
