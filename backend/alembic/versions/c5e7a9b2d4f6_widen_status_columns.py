"""widen_status_columns

Revision ID: c5e7a9b2d4f6
Revises: b4d6f8a1c3e5
Create Date: 2026-06-25 00:00:00.000003

Changes:
- measurements.status, dpr_headers.status: widen VARCHAR(20) -> VARCHAR(50)
  to accommodate admin-configured custom approval-level status codes (up to
  50 chars, matching workflow_stages.status_code) instead of only the
  previously-fixed short literals.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'c5e7a9b2d4f6'
down_revision: Union[str, None] = 'b4d6f8a1c3e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('measurements', 'status', type_=sa.String(50), existing_type=sa.String(20))
    op.alter_column('dpr_headers', 'status', type_=sa.String(50), existing_type=sa.String(20))


def downgrade() -> None:
    op.alter_column('dpr_headers', 'status', type_=sa.String(20), existing_type=sa.String(50))
    op.alter_column('measurements', 'status', type_=sa.String(20), existing_type=sa.String(50))
