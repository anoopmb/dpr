"""redesign boq_construction_templates to header-detail model

Revision ID: h3c4d5e6f7g8
Revises: g2b3c4d5e6f7
Create Date: 2026-06-28
"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = 'h3c4d5e6f7g8'
down_revision = 'g2b3c4d5e6f7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Drop old partial unique indexes ──────────────────────────────────
    op.drop_index('uq_template_no_subtype', table_name='boq_construction_templates')
    op.drop_index('uq_template_with_subtype', table_name='boq_construction_templates')

    # ── 2. Drop FK constraints (auto-named by PostgreSQL) ───────────────────
    op.execute(sa.text(
        "ALTER TABLE boq_construction_templates "
        "DROP CONSTRAINT IF EXISTS boq_construction_templates_material_id_fkey"
    ))
    op.execute(sa.text(
        "ALTER TABLE boq_construction_templates "
        "DROP CONSTRAINT IF EXISTS boq_construction_templates_uom_id_fkey"
    ))

    # ── 3. Drop item-level columns from the header table ────────────────────
    op.drop_column('boq_construction_templates', 'material_id')
    op.drop_column('boq_construction_templates', 'coefficient')
    op.drop_column('boq_construction_templates', 'rate')
    op.drop_column('boq_construction_templates', 'uom_id')
    op.drop_column('boq_construction_templates', 'coefficient_description')

    # ── 4. Clear any dev/test rows so unique indexes can be created cleanly ──
    op.execute(sa.text("DELETE FROM boq_construction_templates"))

    # ── 5. Add header-level columns ──────────────────────────────────────────
    op.add_column(
        'boq_construction_templates',
        sa.Column('name', sa.String(200), nullable=False, server_default='Default'),
    )
    op.alter_column('boq_construction_templates', 'name', server_default=None)
    op.add_column(
        'boq_construction_templates',
        sa.Column('description', sa.String(500), nullable=True),
    )

    # ── 7. Partial unique indexes for name uniqueness (handles NULL subtype) ─
    op.create_index(
        'uq_template_name_no_subtype',
        'boq_construction_templates',
        ['construction_type', 'name'],
        unique=True,
        postgresql_where=sa.text('construction_subtype IS NULL'),
    )
    op.create_index(
        'uq_template_name_with_subtype',
        'boq_construction_templates',
        ['construction_type', 'construction_subtype', 'name'],
        unique=True,
        postgresql_where=sa.text('construction_subtype IS NOT NULL'),
    )

    # ── 8. Create line-items table ───────────────────────────────────────────
    op.create_table(
        'boq_construction_template_items',
        sa.Column('id', UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
        sa.Column(
            'template_id', UUID(as_uuid=True),
            sa.ForeignKey('boq_construction_templates.id', ondelete='CASCADE'),
            nullable=False,
        ),
        sa.Column(
            'material_id', UUID(as_uuid=True),
            sa.ForeignKey('material_master.id', ondelete='RESTRICT'),
            nullable=False,
        ),
        sa.Column('coefficient', sa.Numeric(14, 6), nullable=False),
        sa.Column('rate', sa.Numeric(14, 2), nullable=True),
        sa.Column(
            'uom_id', UUID(as_uuid=True),
            sa.ForeignKey('uom_master.id', ondelete='RESTRICT'),
            nullable=False,
        ),
        sa.Column('notes', sa.String(100), nullable=True),
        sa.Column('bar_diameter_mm', sa.Integer, nullable=True),
        sa.Column('sort_order', sa.Integer, nullable=False, server_default='0'),
        sa.Column(
            'created_at', sa.DateTime(timezone=True),
            nullable=False, server_default=sa.func.now(),
        ),
        sa.Column(
            'updated_at', sa.DateTime(timezone=True),
            nullable=False, server_default=sa.func.now(),
        ),
        sa.UniqueConstraint('template_id', 'material_id', name='uq_template_item_material'),
    )
    op.create_index(
        'ix_template_items_template_id',
        'boq_construction_template_items',
        ['template_id'],
    )

    # ── 9. Update measurements table ─────────────────────────────────────────
    op.drop_column('measurements', 'construction_subtype')
    op.add_column(
        'measurements',
        sa.Column('boq_template_id', UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        'fk_measurements_boq_template_id',
        'measurements', 'boq_construction_templates',
        ['boq_template_id'], ['id'],
        ondelete='SET NULL',
    )
    op.add_column(
        'measurements',
        sa.Column('boq_template_name', sa.String(200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('measurements', 'boq_template_name')
    op.drop_constraint('fk_measurements_boq_template_id', 'measurements', type_='foreignkey')
    op.drop_column('measurements', 'boq_template_id')
    op.add_column(
        'measurements',
        sa.Column('construction_subtype', sa.String(20), nullable=True),
    )

    op.drop_index('ix_template_items_template_id', table_name='boq_construction_template_items')
    op.drop_table('boq_construction_template_items')

    op.drop_index('uq_template_name_no_subtype', table_name='boq_construction_templates')
    op.drop_index('uq_template_name_with_subtype', table_name='boq_construction_templates')
    op.drop_column('boq_construction_templates', 'description')
    op.drop_column('boq_construction_templates', 'name')

    op.add_column(
        'boq_construction_templates',
        sa.Column('coefficient_description', sa.String(100), nullable=True),
    )
    op.add_column(
        'boq_construction_templates',
        sa.Column('uom_id', UUID(as_uuid=True), nullable=False),
    )
    op.add_column(
        'boq_construction_templates',
        sa.Column('rate', sa.Numeric(14, 2), nullable=True),
    )
    op.add_column(
        'boq_construction_templates',
        sa.Column('coefficient', sa.Numeric(14, 6), nullable=False),
    )
    op.add_column(
        'boq_construction_templates',
        sa.Column('material_id', UUID(as_uuid=True), nullable=False),
    )
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
