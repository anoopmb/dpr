"""add location_name to attendance_records

Revision ID: f0a1b3c5d7e9
Revises: e9a0b2c4d6f8
Create Date: 2026-06-24

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f0a1b3c5d7e9"
down_revision: str | None = "e9a0b2c4d6f8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("attendance_records", sa.Column("location_name", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("attendance_records", "location_name")
