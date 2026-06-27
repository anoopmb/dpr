"""add boq item revisions

Revision ID: a2b4c6d8e0f1
Revises: e3f5a7c9b1d0
Create Date: 2026-06-27

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "a2b4c6d8e0f1"
down_revision = "e3f5a7c9b1d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add current_rate and current_tendered_qty to boq_items (backfill from original values)
    op.add_column("boq_items", sa.Column("current_rate", sa.Numeric(14, 2), nullable=True))
    op.add_column("boq_items", sa.Column("current_tendered_qty", sa.Numeric(14, 3), nullable=True))
    op.execute("UPDATE boq_items SET current_rate = rate, current_tendered_qty = tendered_qty")
    op.alter_column("boq_items", "current_rate", nullable=False)
    op.alter_column("boq_items", "current_tendered_qty", nullable=False)

    # 2. Add rate_snapshot to dpr_production_entries
    op.add_column("dpr_production_entries", sa.Column("rate_snapshot", sa.Numeric(14, 2), nullable=True))
    op.execute("""
        UPDATE dpr_production_entries pe
        SET rate_snapshot = CASE
            WHEN pe.qty_today > 0 THEN pe.amount_today / pe.qty_today
            ELSE (SELECT rate FROM boq_items bi WHERE bi.id = pe.boq_item_id)
        END
    """)
    op.alter_column("dpr_production_entries", "rate_snapshot", nullable=False)

    # 3. Backfill measurements.rate where NULL
    op.execute("""
        UPDATE measurements m
        SET rate = (SELECT rate FROM boq_items bi WHERE bi.id = m.boq_item_id)
        WHERE m.rate IS NULL
    """)

    # 4. Create boq_item_revisions table
    op.create_table(
        "boq_item_revisions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("boq_item_id", UUID(as_uuid=True), sa.ForeignKey("boq_items.id", ondelete="CASCADE"), nullable=False),
        sa.Column("revision_number", sa.String(20), nullable=False),
        sa.Column("revision_type", sa.String(30), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="PENDING"),
        sa.Column("effective_from", sa.Date, nullable=False),
        sa.Column("revised_rate", sa.Numeric(14, 2), nullable=True),
        sa.Column("revised_tendered_qty", sa.Numeric(14, 3), nullable=True),
        sa.Column("reason", sa.Text, nullable=False),
        sa.Column("created_by_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("approved_by_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("approved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("rejected_reason", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("boq_item_id", "revision_number", name="uq_boq_revision_item_number"),
    )
    op.create_index("ix_boq_item_revisions_item_date", "boq_item_revisions", ["boq_item_id", "effective_from", "status"])


def downgrade() -> None:
    op.drop_table("boq_item_revisions")
    op.drop_column("dpr_production_entries", "rate_snapshot")
    op.drop_column("boq_items", "current_tendered_qty")
    op.drop_column("boq_items", "current_rate")
