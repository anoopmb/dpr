"""add_boq_templates

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-06-24 18:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'c2d3e4f5a6b7'
down_revision: Union[str, None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'boq_templates',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('description', sa.String(500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_table(
        'boq_template_items',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('template_id', sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('boq_templates.id', ondelete='CASCADE'), nullable=False),
        sa.Column('section_no', sa.String(10), nullable=True),
        sa.Column('section_name', sa.String(200), nullable=True),
        sa.Column('item_no', sa.String(50), nullable=False),
        sa.Column('description', sa.String(500), nullable=False),
        sa.Column('work_type_id', sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('work_type_master.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('uom_id', sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('uom_master.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('tendered_qty', sa.Numeric(14, 3), nullable=False),
        sa.Column('rate', sa.Numeric(14, 2), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint('tendered_qty > 0', name='ck_boq_tmpl_qty_positive'),
        sa.CheckConstraint('rate >= 0', name='ck_boq_tmpl_rate_non_negative'),
    )
    op.create_index('ix_boq_template_items_template_id', 'boq_template_items', ['template_id'])


def downgrade() -> None:
    op.drop_table('boq_template_items')
    op.drop_table('boq_templates')
