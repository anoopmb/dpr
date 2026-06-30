"""standardise dimension field names to MB abbreviations (nos, l, b, d, h)

Revision ID: i4d5e6f7g8h9
Revises: h3c4d5e6f7g8
Create Date: 2026-06-30
"""
from alembic import op

revision = 'i4d5e6f7g8h9'
down_revision = 'h3c4d5e6f7g8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── Step 1: Rename dimension keys in measurements.dimensions JSONB ────────
    # Handles all old keys that may exist, in a single pass per key.
    # The pattern: remove old key, add new key with same value.

    rename_map = [
        ('length',    'l'),
        ('width',     'b'),
        ('breadth',   'b'),
        ('depth',     'd'),
        ('thickness', 'd'),
        ('height',    'h'),
        ('count',     'nos'),
    ]
    for old, new in rename_map:
        op.execute(f"""
            UPDATE measurements
            SET dimensions = (dimensions - '{old}')
                          || jsonb_build_object('{new}', dimensions->>'{old}')
            WHERE dimensions ? '{old}'
        """)

    # Remove 'diameter' — no equivalent in new vocabulary (Q2: not needed)
    op.execute("""
        UPDATE measurements
        SET dimensions = dimensions - 'diameter'
        WHERE dimensions ? 'diameter'
    """)

    # ── Step 2: Backfill nos="1" on EARTHWORK measurements ───────────────────
    # EARTHWORK gains 'nos' in its dimension_fields; existing rows need it so
    # edits don't fail the missing-dimension validator.
    op.execute("""
        UPDATE measurements m
        SET dimensions = m.dimensions || '{"nos": "1"}'::jsonb
        FROM boq_items bi
        JOIN work_type_master wt ON bi.work_type_id = wt.id
        WHERE m.boq_item_id = bi.id
          AND wt.code = 'EARTHWORK'
          AND NOT (m.dimensions ? 'nos')
    """)

    # ── Step 3: Update work_type_master.dimension_fields ─────────────────────
    updates = {
        'EARTHWORK':  '["nos","l","b","d"]',
        'GEN_VOLUME': '["l","b","d"]',
        'BRICKWORK':  '["nos","l","h","d"]',
        'RCC':        '["nos","l","b","h"]',
        'ROAD':       '["nos","l","b","d"]',
        'GEN_AREA':   '["l","b"]',
        'GEN_LENGTH': '["l"]',
        'PLASTERING': '["l","h"]',
        'PIPE_LAYING':'["l"]',
        'GEN_COUNT':  '["nos"]',
        # GEN_HECTARE ['area'], GEN_HOURS ['hours'], GEN_WEIGHT ['weight'] unchanged
    }
    for code, fields in updates.items():
        op.execute(f"""
            UPDATE work_type_master
            SET dimension_fields = '{fields}'::jsonb
            WHERE code = '{code}'
        """)


def downgrade() -> None:
    # Reverse work_type_master dimension_fields
    originals = {
        'EARTHWORK':  '["length","width","depth"]',
        'GEN_VOLUME': '["length","width","depth"]',
        'BRICKWORK':  '["length","height","thickness"]',
        'RCC':        '["length","breadth","height"]',
        'ROAD':       '["length","width","thickness"]',
        'GEN_AREA':   '["length","width"]',
        'GEN_LENGTH': '["length"]',
        'PLASTERING': '["length","height"]',
        'PIPE_LAYING':'["length","diameter"]',
        'GEN_COUNT':  '["count"]',
    }
    for code, fields in originals.items():
        op.execute(f"""
            UPDATE work_type_master
            SET dimension_fields = '{fields}'::jsonb
            WHERE code = '{code}'
        """)

    # Remove backfilled 'nos' from EARTHWORK measurements
    op.execute("""
        UPDATE measurements m
        SET dimensions = m.dimensions - 'nos'
        FROM boq_items bi
        JOIN work_type_master wt ON bi.work_type_id = wt.id
        WHERE m.boq_item_id = bi.id
          AND wt.code = 'EARTHWORK'
    """)

    # Reverse key renames in measurements.dimensions (new → old)
    reverse_map = [
        ('nos', 'count'),
        ('h',   'height'),
        ('d',   'depth'),
        ('b',   'width'),
        ('l',   'length'),
    ]
    for new, old in reverse_map:
        op.execute(f"""
            UPDATE measurements
            SET dimensions = (dimensions - '{new}')
                          || jsonb_build_object('{old}', dimensions->>'{new}')
            WHERE dimensions ? '{new}'
        """)
