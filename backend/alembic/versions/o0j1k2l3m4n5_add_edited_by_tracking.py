"""add edited_by/edited_at tracking to dpr_materials, dpr_machinery,
dpr_labour, expenses, measurements

Revision ID: o0j1k2l3m4n5
Revises: n9i0j1k2l3m4
Create Date: 2026-07-02

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = 'o0j1k2l3m4n5'
down_revision = 'n9i0j1k2l3m4'
branch_labels = None
depends_on = None

_TABLES = ('dpr_materials', 'dpr_machinery', 'dpr_labour', 'expenses', 'measurements')


def upgrade() -> None:
    for table in _TABLES:
        op.add_column(table, sa.Column('edited_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=True))
        op.add_column(table, sa.Column('edited_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    for table in _TABLES:
        op.drop_column(table, 'edited_at')
        op.drop_column(table, 'edited_by')
