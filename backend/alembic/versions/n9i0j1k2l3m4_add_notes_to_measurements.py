"""add notes to measurements

Revision ID: n9i0j1k2l3m4
Revises: m8h9i0j1k2l3
Create Date: 2026-07-02

"""
import sqlalchemy as sa
from alembic import op

revision = 'n9i0j1k2l3m4'
down_revision = 'm8h9i0j1k2l3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('measurements', sa.Column('notes', sa.String(length=1000), nullable=True))


def downgrade() -> None:
    op.drop_column('measurements', 'notes')
