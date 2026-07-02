"""add dimension_expressions to measurements

Revision ID: p1k2l3m4n5o6
Revises: o0j1k2l3m4n5
Create Date: 2026-07-02

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = 'p1k2l3m4n5o6'
down_revision = 'o0j1k2l3m4n5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('measurements', sa.Column('dimension_expressions', JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column('measurements', 'dimension_expressions')
