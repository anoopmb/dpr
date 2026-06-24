"""add_unique_indexes_to_stock_locations

Revision ID: af793e1afc32
Revises: f0a1b3c5d7e9
Create Date: 2026-06-24 05:12:27.564665

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'af793e1afc32'
down_revision: Union[str, None] = 'f0a1b3c5d7e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index('uq_stock_location_ho_name', 'stock_locations', ['name'], unique=True, postgresql_where=sa.text('project_id IS NULL'))
    op.create_index('uq_stock_location_site_name', 'stock_locations', ['name', 'project_id'], unique=True, postgresql_where=sa.text('project_id IS NOT NULL'))


def downgrade() -> None:
    op.drop_index('uq_stock_location_site_name', table_name='stock_locations', postgresql_where=sa.text('project_id IS NOT NULL'))
    op.drop_index('uq_stock_location_ho_name', table_name='stock_locations', postgresql_where=sa.text('project_id IS NULL'))
