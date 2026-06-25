"""add DPR approval workflow

Revision ID: f3a5c7e9b1d2
Revises: e04cff0a85a6
Create Date: 2026-06-25 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = 'f3a5c7e9b1d2'
down_revision: Union[str, None] = 'e04cff0a85a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('dpr_headers', sa.Column('approved_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='RESTRICT'), nullable=True))
    op.add_column('dpr_headers', sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True))

    op.create_table(
        'dpr_header_approvals',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, server_default=sa.text('gen_random_uuid()')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('dpr_header_id', UUID(as_uuid=True), sa.ForeignKey('dpr_headers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('from_status', sa.String(30), nullable=False),
        sa.Column('to_status', sa.String(30), nullable=False),
        sa.Column('acted_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('remarks', sa.String(500), nullable=True),
        sa.Column('acted_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_dpr_header_approvals_dpr_header_id', 'dpr_header_approvals', ['dpr_header_id'])


def downgrade() -> None:
    op.drop_index('ix_dpr_header_approvals_dpr_header_id', table_name='dpr_header_approvals')
    op.drop_table('dpr_header_approvals')
    op.drop_column('dpr_headers', 'approved_at')
    op.drop_column('dpr_headers', 'approved_by')
