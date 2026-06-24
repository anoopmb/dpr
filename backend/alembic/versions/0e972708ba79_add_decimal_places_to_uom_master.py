"""add_decimal_places_to_uom_master

Revision ID: 0e972708ba79
Revises: af793e1afc32
Create Date: 2026-06-24 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '0e972708ba79'
down_revision: Union[str, None] = 'af793e1afc32'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# UOM codes that count whole items rather than measure a continuous quantity.
ZERO_DECIMAL_CODES = ['NOS', 'NO', 'EA', 'EACH', 'UNIT', 'SET', 'PCS', 'PC']


def upgrade() -> None:
    op.add_column('uom_master', sa.Column('decimal_places', sa.Integer(), nullable=False, server_default='3'))
    op.execute(
        sa.text(
            "UPDATE uom_master SET decimal_places = 0 WHERE upper(code) = ANY(:codes)"
        ).bindparams(codes=ZERO_DECIMAL_CODES)
    )
    op.alter_column('uom_master', 'decimal_places', server_default=None)


def downgrade() -> None:
    op.drop_column('uom_master', 'decimal_places')
