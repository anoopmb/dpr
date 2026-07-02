"""add nos to GEN_VOLUME and GEN_AREA (PRODUCT-formula, safe multiplicand)

Revision ID: l7g8h9i0j1k2
Revises: k6f7g8h9i0j1
Create Date: 2026-07-02

"""
from alembic import op

revision = 'l7g8h9i0j1k2'
down_revision = 'k6f7g8h9i0j1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # GEN_VOLUME and GEN_AREA both use the PRODUCT formula (multiplies every
    # listed dimension), same as EARTHWORK/RCC/ROAD/BRICKWORK which already
    # carry 'nos'. Backfill nos="1" on existing rows first so edits don't
    # fail the missing-dimension validator (same pattern as EARTHWORK's
    # backfill in i4d5e6f7g8h9).
    op.execute("""
        UPDATE measurements m
        SET dimensions = m.dimensions || '{"nos": "1"}'::jsonb
        FROM boq_items bi
        JOIN work_type_master wt ON bi.work_type_id = wt.id
        WHERE m.boq_item_id = bi.id
          AND wt.code IN ('GEN_VOLUME', 'GEN_AREA')
          AND NOT (m.dimensions ? 'nos')
    """)

    updates = {
        'GEN_VOLUME': '["nos","l","b","d"]',
        'GEN_AREA': '["nos","l","b"]',
    }
    for code, fields in updates.items():
        op.execute(f"""
            UPDATE work_type_master
            SET dimension_fields = '{fields}'::jsonb
            WHERE code = '{code}'
        """)


def downgrade() -> None:
    originals = {
        'GEN_VOLUME': '["l","b","d"]',
        'GEN_AREA': '["l","b"]',
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
          AND wt.code IN ('GEN_VOLUME', 'GEN_AREA')
    """)
