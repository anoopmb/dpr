"""add_rate_to_dpr_materials

Revision ID: b1c2d3e4f5a6
Revises: a07563f8939b
Create Date: 2026-06-24 16:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = 'a07563f8939b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('dpr_materials', sa.Column('rate', sa.Numeric(14, 2), nullable=True))
    op.execute(
        """
        UPDATE dpr_materials
        SET rate = material_master.cost_rate
        FROM material_master
        WHERE dpr_materials.material_id = material_master.id
          AND dpr_materials.rate IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column('dpr_materials', 'rate')
