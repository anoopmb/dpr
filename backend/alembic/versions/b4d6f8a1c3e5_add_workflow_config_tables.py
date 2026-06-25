"""add_workflow_config_tables

Revision ID: b4d6f8a1c3e5
Revises: a3c5e7f9b1d2
Create Date: 2026-06-25 00:00:00.000002

Changes:
- New workflow_definitions / workflow_stages tables backing the
  configurable, per-project-overridable approval workflow for
  measurements and DPR headers.
- Seeds two org-wide default definitions (project_id NULL) that exactly
  reproduce today's hardcoded behavior, so nothing changes for existing
  projects until an admin edits the config:
    MEASUREMENT: Level 1 "PM Approval" (status_code=PM_APPROVED,
      roles=[PROJECT_MANAGER, ADMIN], feeds_production=True — PM approval
      alone already lets the qty count toward DPR production; a later PM
      rejection at the QS stage removes it again since the row's status
      moves to REJECTED), Level 2 "QS Approval" (status_code=QS_APPROVED,
      roles=[QUANTITY_SURVEYOR, ADMIN], feeds_production=True,
      is_final_approval=True), lock_allowed_roles=[QUANTITY_SURVEYOR, ADMIN]
    DPR_HEADER: Level 1 "PM Approval" (status_code=APPROVED,
      roles=[PROJECT_MANAGER, ADMIN], is_final_approval=True)
"""
import uuid
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = 'b4d6f8a1c3e5'
down_revision: Union[str, None] = 'a3c5e7f9b1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'workflow_definitions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('entity_type', sa.String(20), nullable=False),
        sa.Column('project_id', UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('approvals_enabled', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('lock_allowed_roles', JSONB(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint('entity_type', 'project_id', name='uq_workflow_definition_entity_project'),
    )

    op.create_table(
        'workflow_stages',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column(
            'workflow_definition_id', UUID(as_uuid=True),
            sa.ForeignKey('workflow_definitions.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column('sequence_order', sa.Integer(), nullable=False),
        sa.Column('status_code', sa.String(50), nullable=False),
        sa.Column('label', sa.String(100), nullable=False),
        sa.Column('allowed_roles', JSONB(), nullable=False),
        sa.Column('allow_reject', sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column('feeds_production', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('is_final_approval', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint('workflow_definition_id', 'sequence_order', name='uq_workflow_stage_sequence'),
        sa.UniqueConstraint('workflow_definition_id', 'status_code', name='uq_workflow_stage_status_code'),
    )

    measurement_def_id = uuid.uuid4()
    dpr_def_id = uuid.uuid4()

    op.execute(
        sa.text(
            "INSERT INTO workflow_definitions "
            "(id, entity_type, project_id, name, approvals_enabled, lock_allowed_roles, is_active) "
            "VALUES (:id, 'MEASUREMENT', NULL, 'Default Measurement Approval', true, "
            "'[\"QUANTITY_SURVEYOR\", \"ADMIN\"]', true)"
        ).bindparams(sa.bindparam("id", value=measurement_def_id, type_=UUID(as_uuid=True)))
    )
    op.execute(
        sa.text(
            "INSERT INTO workflow_definitions "
            "(id, entity_type, project_id, name, approvals_enabled, lock_allowed_roles, is_active) "
            "VALUES (:id, 'DPR_HEADER', NULL, 'Default DPR Approval', true, NULL, true)"
        ).bindparams(sa.bindparam("id", value=dpr_def_id, type_=UUID(as_uuid=True)))
    )

    op.execute(
        sa.text(
            "INSERT INTO workflow_stages "
            "(id, workflow_definition_id, sequence_order, status_code, label, allowed_roles, "
            "allow_reject, feeds_production, is_final_approval) VALUES "
            "(:id1, :defid, 1, 'PM_APPROVED', 'PM Approval', '[\"PROJECT_MANAGER\", \"ADMIN\"]', "
            "true, true, false), "
            "(:id2, :defid, 2, 'QS_APPROVED', 'QS Approval', '[\"QUANTITY_SURVEYOR\", \"ADMIN\"]', "
            "true, true, true)"
        ).bindparams(
            sa.bindparam("id1", value=uuid.uuid4(), type_=UUID(as_uuid=True)),
            sa.bindparam("id2", value=uuid.uuid4(), type_=UUID(as_uuid=True)),
            sa.bindparam("defid", value=measurement_def_id, type_=UUID(as_uuid=True)),
        )
    )
    op.execute(
        sa.text(
            "INSERT INTO workflow_stages "
            "(id, workflow_definition_id, sequence_order, status_code, label, allowed_roles, "
            "allow_reject, feeds_production, is_final_approval) VALUES "
            "(:id1, :defid, 1, 'APPROVED', 'PM Approval', '[\"PROJECT_MANAGER\", \"ADMIN\"]', "
            "true, false, true)"
        ).bindparams(
            sa.bindparam("id1", value=uuid.uuid4(), type_=UUID(as_uuid=True)),
            sa.bindparam("defid", value=dpr_def_id, type_=UUID(as_uuid=True)),
        )
    )


def downgrade() -> None:
    op.drop_table('workflow_stages')
    op.drop_table('workflow_definitions')
