"""steel_line_description_nullable

Revision ID: j5e6f7g8h9i0
Revises: i4d5e6f7g8h9
Create Date: 2026-06-30

"""
from alembic import op

revision = 'j5e6f7g8h9i0'
down_revision = 'i4d5e6f7g8h9'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('measurement_steel_lines', 'description', nullable=True)


def downgrade() -> None:
    op.execute("UPDATE measurement_steel_lines SET description = '' WHERE description IS NULL")
    op.alter_column('measurement_steel_lines', 'description', nullable=False)
