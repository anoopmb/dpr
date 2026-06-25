"""add timezone to organization settings

Revision ID: e04cff0a85a6
Revises: 5d0fb73e1289
Create Date: 2026-06-25 08:25:58.903961

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e04cff0a85a6'
down_revision: Union[str, None] = '5d0fb73e1289'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Autogenerate also picked up two unrelated pre-existing index diffs
    # (ix_boq_template_items_template_id, ix_push_subscriptions_user_id) —
    # not part of this change, left untouched.
    op.add_column(
        'organization_settings',
        sa.Column('timezone', sa.String(length=50), nullable=False, server_default='Asia/Kolkata'),
    )


def downgrade() -> None:
    op.drop_column('organization_settings', 'timezone')
