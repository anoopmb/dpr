"""add nos to GEN_LENGTH, PIPE_LAYING, PLASTERING (formula engine now
supports nos as a leading multiplicand for LENGTH_ONLY/AREA_LH too)

Revision ID: m8h9i0j1k2l3
Revises: l7g8h9i0j1k2
Create Date: 2026-07-02

"""
from alembic import op

revision = 'm8h9i0j1k2l3'
down_revision = 'l7g8h9i0j1k2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Backfill nos="1" on existing rows first so edits don't fail the
    # missing-dimension validator (same pattern as prior nos backfills).
    op.execute("""
        UPDATE measurements m
        SET dimensions = m.dimensions || '{"nos": "1"}'::jsonb
        FROM boq_items bi
        JOIN work_type_master wt ON bi.work_type_id = wt.id
        WHERE m.boq_item_id = bi.id
          AND wt.code IN ('GEN_LENGTH', 'PIPE_LAYING', 'PLASTERING')
          AND NOT (m.dimensions ? 'nos')
    """)

    updates = {
        'GEN_LENGTH': '["nos","l"]',
        'PIPE_LAYING': '["nos","l"]',
        'PLASTERING': '["nos","l","d"]',
    }
    for code, fields in updates.items():
        op.execute(f"""
            UPDATE work_type_master
            SET dimension_fields = '{fields}'::jsonb
            WHERE code = '{code}'
        """)


def downgrade() -> None:
    originals = {
        'GEN_LENGTH': '["l"]',
        'PIPE_LAYING': '["l"]',
        'PLASTERING': '["l","d"]',
    }
    for code, fields in originals.items():
        op.execute(f"""
            UPDATE work_type_master
            SET dimension_fields = '{fields}'::jsonb
            WHERE code = '{code}'
        """)

    op.execute("""
        UPDATE measurements m
        SET dimensions = m.dimensions - 'nos'
        FROM boq_items bi
        JOIN work_type_master wt ON bi.work_type_id = wt.id
        WHERE m.boq_item_id = bi.id
          AND wt.code IN ('GEN_LENGTH', 'PIPE_LAYING', 'PLASTERING')
    """)
