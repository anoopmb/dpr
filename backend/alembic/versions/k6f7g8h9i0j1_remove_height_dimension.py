"""remove height dimension, fold into depth/breadth

Revision ID: k6f7g8h9i0j1
Revises: j5e6f7g8h9i0
Create Date: 2026-07-02

"""
from alembic import op

revision = 'k6f7g8h9i0j1'
down_revision = 'j5e6f7g8h9i0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── RCC and PLASTERING: 'h' had no existing 'd' on those work types,
    # so it's a pure rename in both dimension_fields and any recorded data.
    for code in ('RCC', 'PLASTERING'):
        op.execute(f"""
            UPDATE measurements m
            SET dimensions = (m.dimensions - 'h')
                          || jsonb_build_object('d', m.dimensions->>'h')
            FROM boq_items bi
            JOIN work_type_master wt ON bi.work_type_id = wt.id
            WHERE m.boq_item_id = bi.id
              AND wt.code = '{code}'
              AND m.dimensions ? 'h'
        """)

    # ── BRICKWORK already had both 'h' and 'd' as separate dimensions
    # (nos,l,h,d — wall height and thickness as distinct multiplicands).
    # 'd' is kept; 'h' has no slot in the new 4-field shape (nos,l,b,d) and
    # is dropped outright — there is no safe automatic value to give the
    # new 'b' (breadth) field, so recorded rows are left without one until
    # next edit.
    op.execute("""
        UPDATE measurements m
        SET dimensions = m.dimensions - 'h'
        FROM boq_items bi
        JOIN work_type_master wt ON bi.work_type_id = wt.id
        WHERE m.boq_item_id = bi.id
          AND wt.code = 'BRICKWORK'
          AND m.dimensions ? 'h'
    """)

    updates = {
        'RCC': '["nos","l","b","d"]',
        'BRICKWORK': '["nos","l","b","d"]',
        'PLASTERING': '["l","d"]',
    }
    for code, fields in updates.items():
        op.execute(f"""
            UPDATE work_type_master
            SET dimension_fields = '{fields}'::jsonb
            WHERE code = '{code}'
        """)


def downgrade() -> None:
    originals = {
        'RCC': '["nos","l","b","h"]',
        'BRICKWORK': '["nos","l","h","d"]',
        'PLASTERING': '["l","h"]',
    }
    for code, fields in originals.items():
        op.execute(f"""
            UPDATE work_type_master
            SET dimension_fields = '{fields}'::jsonb
            WHERE code = '{code}'
        """)

    # Reverse the pure rename for RCC/PLASTERING. BRICKWORK's dropped 'h'
    # value cannot be recovered (same irreversibility precedent as the
    # 'diameter' drop in i4d5e6f7g8h9's downgrade).
    for code in ('RCC', 'PLASTERING'):
        op.execute(f"""
            UPDATE measurements m
            SET dimensions = (m.dimensions - 'd')
                          || jsonb_build_object('h', m.dimensions->>'d')
            FROM boq_items bi
            JOIN work_type_master wt ON bi.work_type_id = wt.id
            WHERE m.boq_item_id = bi.id
              AND wt.code = '{code}'
              AND m.dimensions ? 'd'
        """)
