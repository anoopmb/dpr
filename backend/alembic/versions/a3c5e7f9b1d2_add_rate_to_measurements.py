"""add_rate_to_measurements

Revision ID: a3c5e7f9b1d2
Revises: f4b6d8e0a2c1
Create Date: 2026-06-25 00:00:00.000001

Changes:
- measurements: add nullable rate column (Numeric 14,2) — per-measurement
  override of the BOQ item's rate, captured at recording time so a later
  change to the BOQ item's rate doesn't retroactively change historical
  measurement amounts. Null means "use the BOQ item's rate" (legacy rows
  and any future row created without an explicit override).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'a3c5e7f9b1d2'
down_revision: Union[str, None] = 'f4b6d8e0a2c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('measurements', sa.Column('rate', sa.Numeric(14, 2), nullable=True))


def downgrade() -> None:
    op.drop_column('measurements', 'rate')
