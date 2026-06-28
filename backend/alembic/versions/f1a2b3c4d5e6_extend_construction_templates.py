"""extend boq_construction_templates for concrete and steel

Revision ID: f1a2b3c4d5e6
Revises: e5a7c9b1d3f6
Create Date: 2026-06-28
"""
from alembic import op
import sqlalchemy as sa

revision = 'f1a2b3c4d5e6'
down_revision = 'e5a7c9b1d3f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint('ck_bituminous_types_only', 'boq_construction_templates', type_='check')
    op.drop_constraint('uq_construction_template', 'boq_construction_templates', type_='unique')
    op.add_column('boq_construction_templates', sa.Column('construction_subtype', sa.String(20), nullable=True))
    op.create_index(
        'uq_template_no_subtype',
        'boq_construction_templates',
        ['construction_type', 'material_id'],
        unique=True,
        postgresql_where=sa.text('construction_subtype IS NULL'),
    )
    op.create_index(
        'uq_template_with_subtype',
        'boq_construction_templates',
        ['construction_type', 'construction_subtype', 'material_id'],
        unique=True,
        postgresql_where=sa.text('construction_subtype IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('uq_template_with_subtype', 'boq_construction_templates')
    op.drop_index('uq_template_no_subtype', 'boq_construction_templates')
    op.drop_column('boq_construction_templates', 'construction_subtype')
    op.create_unique_constraint('uq_construction_template', 'boq_construction_templates', ['construction_type', 'material_id'])
    op.create_check_constraint(
        'ck_bituminous_types_only',
        'boq_construction_templates',
        "construction_type IN ('PRIME_COAT','TACK_COAT','BM','DBM','BC')",
    )
