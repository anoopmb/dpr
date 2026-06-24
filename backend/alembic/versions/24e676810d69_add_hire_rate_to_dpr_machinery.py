"""add_hire_rate_to_dpr_machinery

Revision ID: 24e676810d69
Revises: 0e972708ba79
Create Date: 2026-06-24 14:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '24e676810d69'
down_revision: Union[str, None] = '0e972708ba79'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('dpr_machinery', sa.Column('hire_rate', sa.Numeric(10, 2), nullable=True))
    # Best-effort historical snapshot: backfill existing rows with the
    # current master rate. True historical rate isn't recoverable for
    # entries logged before per-entry rate capture existed.
    op.execute(
        """
        UPDATE dpr_machinery
        SET hire_rate = machinery_master.hire_rate
        FROM machinery_master
        WHERE dpr_machinery.machinery_id = machinery_master.id
          AND dpr_machinery.hire_rate IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column('dpr_machinery', 'hire_rate')
