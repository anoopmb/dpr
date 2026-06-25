"""machinery_hire_unit_and_quantity_used

Revision ID: f4b6d8e0a2c1
Revises: 24e676810d69
Create Date: 2026-06-25 00:00:00.000000

Changes:
- machinery_master.hire_unit: fill NULLs → 'HOUR', add server default, add CHECK constraint
- dpr_machinery: rename hours_used → quantity_used, widen to Numeric(10,3)
- dpr_machinery: drop hours-range CHECK, add qty > 0 CHECK
- dpr_machinery: add hire_unit snapshot column, backfill from machinery_master
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'f4b6d8e0a2c1'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_VALID_UNITS = "('HOUR','HALF_DAY','DAY','WEEK','MONTH','YEAR','OWNED')"


def upgrade() -> None:
    # ── machinery_master ──────────────────────────────────────────────────────
    # Normalise any free-text values that were stored before the enum existed,
    # then fill NULLs, enforce NOT NULL + valid values
    op.execute("""
        UPDATE machinery_master SET hire_unit = CASE
            WHEN LOWER(hire_unit) IN ('hr','hour','hrs','hourly') THEN 'HOUR'
            WHEN LOWER(hire_unit) IN ('half day','halfday','half-day') THEN 'HALF_DAY'
            WHEN LOWER(hire_unit) IN ('day','daily','d') THEN 'DAY'
            WHEN LOWER(hire_unit) IN ('week','weekly','wk') THEN 'WEEK'
            WHEN LOWER(hire_unit) IN ('month','monthly','mo') THEN 'MONTH'
            WHEN LOWER(hire_unit) IN ('year','yearly','yr','annual') THEN 'YEAR'
            WHEN LOWER(hire_unit) IN ('owned','own') THEN 'OWNED'
            ELSE 'HOUR'
        END
        WHERE hire_unit NOT IN ('HOUR','HALF_DAY','DAY','WEEK','MONTH','YEAR','OWNED')
           OR hire_unit IS NULL
    """)
    op.alter_column('machinery_master', 'hire_unit',
                    existing_type=sa.String(20),
                    nullable=False,
                    server_default='HOUR')
    op.create_check_constraint(
        'ck_machinery_master_hire_unit',
        'machinery_master',
        f"hire_unit IN {_VALID_UNITS}",
    )
    # OWNED machines have no hire cost
    op.execute("UPDATE machinery_master SET hire_rate = NULL WHERE hire_unit = 'OWNED'")

    # ── dpr_machinery ─────────────────────────────────────────────────────────
    # Drop old check constraint
    op.drop_constraint('ck_dpr_machinery_hours_range', 'dpr_machinery', type_='check')

    # Rename hours_used → quantity_used and widen precision
    op.alter_column('dpr_machinery', 'hours_used',
                    new_column_name='quantity_used',
                    existing_type=sa.Numeric(5, 2),
                    type_=sa.Numeric(10, 3),
                    nullable=False)

    # Add hire_unit snapshot column
    op.add_column('dpr_machinery', sa.Column('hire_unit', sa.String(20),
                                             nullable=True))
    # Backfill from master
    op.execute("""
        UPDATE dpr_machinery dm
        SET hire_unit = mm.hire_unit
        FROM machinery_master mm
        WHERE dm.machinery_id = mm.id
    """)
    # Default any still-null to 'HOUR' (orphaned rows)
    op.execute("UPDATE dpr_machinery SET hire_unit = 'HOUR' WHERE hire_unit IS NULL")
    op.alter_column('dpr_machinery', 'hire_unit',
                    existing_type=sa.String(20),
                    nullable=False,
                    server_default='HOUR')

    # Clear hire_rate for OWNED entries (no cost)
    op.execute("UPDATE dpr_machinery SET hire_rate = NULL WHERE hire_unit = 'OWNED'")

    # New constraint: quantity > 0
    op.create_check_constraint('ck_dpr_machinery_qty_positive', 'dpr_machinery',
                               'quantity_used > 0')

    # Widen hire_rate column to match new master precision
    op.alter_column('dpr_machinery', 'hire_rate',
                    existing_type=sa.Numeric(10, 2),
                    type_=sa.Numeric(14, 2),
                    nullable=True)


def downgrade() -> None:
    op.drop_constraint('ck_dpr_machinery_qty_positive', 'dpr_machinery', type_='check')
    op.drop_column('dpr_machinery', 'hire_unit')
    op.alter_column('dpr_machinery', 'quantity_used',
                    new_column_name='hours_used',
                    existing_type=sa.Numeric(10, 3),
                    type_=sa.Numeric(5, 2),
                    nullable=False)
    op.create_check_constraint('ck_dpr_machinery_hours_range', 'dpr_machinery',
                               'hours_used > 0 AND hours_used <= 24')
    op.drop_constraint('ck_machinery_master_hire_unit', 'machinery_master', type_='check')
    op.alter_column('machinery_master', 'hire_unit',
                    existing_type=sa.String(20),
                    nullable=True,
                    server_default=None)
