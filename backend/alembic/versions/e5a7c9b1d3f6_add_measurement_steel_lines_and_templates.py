"""add measurement_steel_lines and boq_construction_templates tables

Revision ID: e5a7c9b1d3f6
Revises: d4f6b8a2c0e5
Create Date: 2026-06-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'e5a7c9b1d3f6'
down_revision = 'd4f6b8a2c0e5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'measurement_steel_lines',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('measurement_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('description', sa.String(200), nullable=False),
        sa.Column('diameter_mm', sa.Integer(), nullable=False),
        sa.Column('bar_count', sa.Numeric(10, 0), nullable=False),
        sa.Column('length_m', sa.Numeric(10, 3), nullable=False),
        sa.Column('coefficient', sa.Numeric(10, 6), nullable=False),
        sa.Column('computed_weight_mt', sa.Numeric(14, 6), nullable=False),
        sa.ForeignKeyConstraint(['measurement_id'], ['measurements.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_measurement_steel_lines_measurement_id', 'measurement_steel_lines', ['measurement_id'])

    op.create_table(
        'boq_construction_templates',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False, server_default=sa.text('gen_random_uuid()')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')),
        sa.Column('construction_type', sa.String(20), nullable=False),
        sa.Column('material_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('coefficient', sa.Numeric(14, 6), nullable=False),
        sa.Column('coefficient_description', sa.String(100), nullable=True),
        sa.Column('uom_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.ForeignKeyConstraint(['material_id'], ['material_master.id'], ondelete='RESTRICT'),
        sa.ForeignKeyConstraint(['uom_id'], ['uom_master.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('construction_type', 'material_id', name='uq_construction_template'),
        sa.CheckConstraint(
            "construction_type IN ('PRIME_COAT','TACK_COAT','BM','DBM','BC')",
            name='ck_bituminous_types_only',
        ),
    )


def downgrade() -> None:
    op.drop_table('boq_construction_templates')
    op.drop_index('ix_measurement_steel_lines_measurement_id', 'measurement_steel_lines')
    op.drop_table('measurement_steel_lines')
