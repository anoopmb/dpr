"""add daily_rate to worker_category_master

Revision ID: f1a3c5e7b9d2
Revises: e8f2a6b0c4d5
Create Date: 2026-06-23

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "f1a3c5e7b9d2"
down_revision: str | None = "e8f2a6b0c4d5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("worker_category_master", sa.Column("daily_rate", sa.Numeric(14, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("worker_category_master", "daily_rate")
