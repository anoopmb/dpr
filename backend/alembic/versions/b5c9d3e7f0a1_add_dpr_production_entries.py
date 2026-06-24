"""add dpr production entries and dpr header daily work summary

Revision ID: b5c9d3e7f0a1
Revises: a4f8b2c1d9e3
Create Date: 2026-06-23

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b5c9d3e7f0a1"
down_revision: Union[str, None] = "a4f8b2c1d9e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("dpr_headers", sa.Column("daily_work_summary", sa.String(500), nullable=True))
    op.create_table(
        "dpr_production_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("dpr_header_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("boq_item_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("qty_today", sa.Numeric(14, 3), nullable=False),
        sa.Column("amount_today", sa.Numeric(14, 2), nullable=False),
        sa.Column("chainage", sa.String(100), nullable=True),
        sa.Column("remarks", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["dpr_header_id"], ["dpr_headers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["boq_item_id"], ["boq_items.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dpr_header_id", "boq_item_id", name="uq_dpr_production_entry"),
    )


def downgrade() -> None:
    op.drop_table("dpr_production_entries")
    op.drop_column("dpr_headers", "daily_work_summary")
