import uuid
from enum import StrEnum

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TimestampedBase


class WorkflowEntityType(StrEnum):
    MEASUREMENT = "MEASUREMENT"
    DPR_HEADER = "DPR_HEADER"


class WorkflowDefinition(TimestampedBase):
    """Configurable approval workflow for one entity type, org-wide
    (project_id NULL) or scoped to a single project (project override).
    DRAFT/SUBMITTED/REJECTED stay fixed, built-in bookend statuses on the
    owning entity — only the approval levels in between are configured here."""

    __tablename__ = "workflow_definitions"
    __table_args__ = (
        UniqueConstraint("entity_type", "project_id", name="uq_workflow_definition_entity_project"),
    )

    entity_type: Mapped[WorkflowEntityType] = mapped_column(String(20), nullable=False)
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # When False, submitting a record skips every level below and lands
    # directly on the final-approval status_code — no peer review required.
    approvals_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Measurement-only: roles allowed to perform the separate "Lock" freeze
    # action once a measurement has reached its final approval level. Null
    # for DPR_HEADER definitions, which have no equivalent lock step.
    lock_allowed_roles: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    levels: Mapped[list["WorkflowStage"]] = relationship(
        back_populates="workflow_definition",
        cascade="all, delete-orphan",
        order_by="WorkflowStage.sequence_order",
    )

    @property
    def is_org_default(self) -> bool:
        return self.project_id is None


class WorkflowStage(TimestampedBase):
    """One approval level within a WorkflowDefinition. Admin-facing label is
    "approval level" (Level 1, Level 2, ...) — `sequence_order` is the level
    number. `status_code` is the literal value written to the owning
    entity's `status` column when a record reaches this level."""

    __tablename__ = "workflow_stages"
    __table_args__ = (
        UniqueConstraint("workflow_definition_id", "sequence_order", name="uq_workflow_stage_sequence"),
        UniqueConstraint("workflow_definition_id", "status_code", name="uq_workflow_stage_status_code"),
    )

    workflow_definition_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workflow_definitions.id", ondelete="CASCADE"), nullable=False
    )
    sequence_order: Mapped[int] = mapped_column(Integer, nullable=False)
    status_code: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)
    allowed_roles: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    allow_reject: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # Measurement-only: whether this level's quantity counts toward DPR
    # production sync. Ignored (always treated False) for DPR_HEADER levels.
    feeds_production: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Marks the terminal "fully approved" level — feeds has_approved checks,
    # blocks deletion once reached, and satisfies "DPR can't submit while a
    # measurement is pending" once every measurement reaches this level.
    is_final_approval: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    workflow_definition: Mapped["WorkflowDefinition"] = relationship(back_populates="levels")
