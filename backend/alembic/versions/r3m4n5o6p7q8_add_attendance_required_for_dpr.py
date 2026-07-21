"""add attendance_required_for_dpr to projects

Revision ID: r3m4n5o6p7q8
Revises: q2l3m4n5o6p7
Create Date: 2026-07-15

"""
from alembic import op
import sqlalchemy as sa

revision = 'r3m4n5o6p7q8'
down_revision = 'q2l3m4n5o6p7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'projects',
        sa.Column(
            'attendance_required_for_dpr',
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )


def downgrade() -> None:
    op.drop_column('projects', 'attendance_required_for_dpr')
