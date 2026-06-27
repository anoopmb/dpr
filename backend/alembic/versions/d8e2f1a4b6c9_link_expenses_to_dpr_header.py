"""link expenses to dpr header

Revision ID: d8e2f1a4b6c9
Revises: c5e7a9b2d4f6
Create Date: 2026-06-27

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "d8e2f1a4b6c9"
down_revision = "c5e7a9b2d4f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "expenses",
        sa.Column("dpr_header_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_expenses_dpr_header_id",
        "expenses",
        "dpr_headers",
        ["dpr_header_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_expenses_dpr_header_id", "expenses", ["dpr_header_id"])


def downgrade() -> None:
    op.drop_index("ix_expenses_dpr_header_id", table_name="expenses")
    op.drop_constraint("fk_expenses_dpr_header_id", "expenses", type_="foreignkey")
    op.drop_column("expenses", "dpr_header_id")
