"""widen gps_accuracy_meters to NUMERIC(10,2)

Revision ID: q2l3m4n5o6p7
Revises: p1k2l3m4n5o6
Create Date: 2026-07-13

"""
from alembic import op
import sqlalchemy as sa

revision = 'q2l3m4n5o6p7'
down_revision = 'p1k2l3m4n5o6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        'attendance_records',
        'gps_accuracy_meters',
        existing_type=sa.Numeric(6, 2),
        type_=sa.Numeric(10, 2),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        'attendance_records',
        'gps_accuracy_meters',
        existing_type=sa.Numeric(10, 2),
        type_=sa.Numeric(6, 2),
        existing_nullable=True,
    )
