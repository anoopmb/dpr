"""add overtime_amount to dpr_labour

Revision ID: e3f5a7c9b1d0
Revises: d8e2f1a4b6c9
Create Date: 2026-06-27

"""

from alembic import op
import sqlalchemy as sa

revision = "e3f5a7c9b1d0"
down_revision = "d8e2f1a4b6c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "dpr_labour",
        sa.Column("overtime_amount", sa.Numeric(14, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("dpr_labour", "overtime_amount")
