"""add project_id to notifications

Revision ID: d7f9b1c3e5a7
Revises: c5e7a9b1d3f5
Create Date: 2026-06-24

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d7f9b1c3e5a7"
down_revision: str | None = "c5e7a9b1d3f5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("notifications", sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        "fk_notifications_project_id", "notifications", "projects", ["project_id"], ["id"], ondelete="SET NULL"
    )


def downgrade() -> None:
    op.drop_constraint("fk_notifications_project_id", "notifications", type_="foreignkey")
    op.drop_column("notifications", "project_id")
