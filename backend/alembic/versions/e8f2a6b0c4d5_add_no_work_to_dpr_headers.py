"""add no_work and no_work_reason to dpr_headers

Revision ID: e8f2a6b0c4d5
Revises: d7e1f5g9h3i4
Create Date: 2026-06-23

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e8f2a6b0c4d5"
down_revision: str | None = "d7e1f5g9h3i4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "dpr_headers",
        sa.Column("no_work", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("dpr_headers", sa.Column("no_work_reason", sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column("dpr_headers", "no_work_reason")
    op.drop_column("dpr_headers", "no_work")
