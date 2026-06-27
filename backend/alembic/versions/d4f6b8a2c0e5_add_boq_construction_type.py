"""add boq construction type and material template columns

Revision ID: d4f6b8a2c0e5
Revises: a2b4c6d8e0f1
Create Date: 2026-06-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'd4f6b8a2c0e5'
down_revision = 'a2b4c6d8e0f1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('boq_items', sa.Column('construction_type', sa.String(20), nullable=False, server_default='GENERAL'))
    op.add_column('measurements', sa.Column('construction_subtype', sa.String(20), nullable=True))
    op.add_column('dpr_materials', sa.Column(
        'source_measurement_id',
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey('measurements.id', ondelete='SET NULL'),
        nullable=True,
    ))
    op.add_column('dpr_materials', sa.Column('manually_edited', sa.Boolean(), nullable=False, server_default='false'))
    op.add_column('organization_settings', sa.Column('steel_measurement_uom', sa.String(3), nullable=False, server_default='MT'))


def downgrade() -> None:
    op.drop_column('organization_settings', 'steel_measurement_uom')
    op.drop_column('dpr_materials', 'manually_edited')
    op.drop_column('dpr_materials', 'source_measurement_id')
    op.drop_column('measurements', 'construction_subtype')
    op.drop_column('boq_items', 'construction_type')
