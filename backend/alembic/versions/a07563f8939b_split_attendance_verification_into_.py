"""split_attendance_verification_into_photo_and_gps

Revision ID: a07563f8939b
Revises: 24e676810d69
Create Date: 2026-06-24 15:30:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'a07563f8939b'
down_revision: Union[str, None] = '24e676810d69'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('projects', sa.Column('attendance_photo_required', sa.Boolean(), nullable=True))
    op.add_column('projects', sa.Column('attendance_gps_required', sa.Boolean(), nullable=True))
    op.execute(
        "UPDATE projects SET attendance_photo_required = attendance_verification_required, "
        "attendance_gps_required = attendance_verification_required"
    )
    op.alter_column('projects', 'attendance_photo_required', nullable=False)
    op.alter_column('projects', 'attendance_gps_required', nullable=False)
    op.drop_column('projects', 'attendance_verification_required')


def downgrade() -> None:
    op.add_column('projects', sa.Column('attendance_verification_required', sa.Boolean(), nullable=True))
    op.execute(
        "UPDATE projects SET attendance_verification_required = (attendance_photo_required OR attendance_gps_required)"
    )
    op.alter_column('projects', 'attendance_verification_required', nullable=False)
    op.drop_column('projects', 'attendance_gps_required')
    op.drop_column('projects', 'attendance_photo_required')
