"""add rate to boq_construction_templates

Revision ID: g2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-06-28
"""
from alembic import op
import sqlalchemy as sa

revision = 'g2b3c4d5e6f7'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'boq_construction_templates',
        sa.Column('rate', sa.Numeric(14, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('boq_construction_templates', 'rate')
