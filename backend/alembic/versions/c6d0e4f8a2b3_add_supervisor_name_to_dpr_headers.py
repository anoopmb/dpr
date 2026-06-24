"""add supervisor_name to dpr_headers

Revision ID: c6d0e4f8a2b3
Revises: b5c9d3e7f0a1
Create Date: 2026-06-23

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c6d0e4f8a2b3"
down_revision: str | None = "b5c9d3e7f0a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("dpr_headers", sa.Column("supervisor_name", sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column("dpr_headers", "supervisor_name")
