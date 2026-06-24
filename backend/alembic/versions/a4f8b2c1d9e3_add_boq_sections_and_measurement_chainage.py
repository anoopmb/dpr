"""add boq sections and measurement chainage

Revision ID: a4f8b2c1d9e3
Revises: 98043e1dbde0
Create Date: 2026-06-23

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a4f8b2c1d9e3"
down_revision: Union[str, None] = "074d93dccebc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "boq_sections",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("section_no", sa.String(10), nullable=False),
        sa.Column("section_name", sa.String(200), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("project_id", "section_no", name="uq_boq_section_project_no"),
    )
    op.add_column("boq_items", sa.Column("section_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_boq_items_section_id",
        "boq_items",
        "boq_sections",
        ["section_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column("measurements", sa.Column("chainage", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("measurements", "chainage")
    op.drop_constraint("fk_boq_items_section_id", "boq_items", type_="foreignkey")
    op.drop_column("boq_items", "section_id")
    op.drop_table("boq_sections")
