"""add cost_rate to material_master and hire_rate to machinery_master

Revision ID: d7e1f5g9h3i4
Revises: c6d0e4f8a2b3
Create Date: 2026-06-23

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d7e1f5g9h3i4"
down_revision: str | None = "c6d0e4f8a2b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("material_master", sa.Column("cost_rate", sa.Numeric(14, 2), nullable=True))
    op.add_column("material_master", sa.Column("cost_rate_unit", sa.String(50), nullable=True))
    op.add_column("machinery_master", sa.Column("hire_rate", sa.Numeric(14, 2), nullable=True))
    op.add_column("machinery_master", sa.Column("hire_unit", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("material_master", "cost_rate")
    op.drop_column("material_master", "cost_rate_unit")
    op.drop_column("machinery_master", "hire_rate")
    op.drop_column("machinery_master", "hire_unit")
