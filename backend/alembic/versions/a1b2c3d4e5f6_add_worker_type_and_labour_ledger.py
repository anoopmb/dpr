"""add worker type, dpr_labour and worker_payments

Revision ID: a1b2c3d4e5f6
Revises: f3a5c7e9b1d2
Create Date: 2026-06-25
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = 'f3a5c7e9b1d2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Extend workers table
    op.add_column('workers', sa.Column('worker_type', sa.String(20), nullable=False, server_default='NORMAL'))
    op.add_column('workers', sa.Column('wage_unit', sa.String(20), nullable=True))
    op.add_column('workers', sa.Column('default_rate', sa.Numeric(14, 2), nullable=True))

    # DPR labour entries
    op.create_table(
        'dpr_labour',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('dpr_header_id', sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('dpr_headers.id', ondelete='CASCADE'), nullable=False),
        sa.Column('worker_id', sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('workers.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('quantity', sa.Numeric(14, 3), nullable=False),
        sa.Column('rate', sa.Numeric(14, 2), nullable=False),
        sa.Column('amount', sa.Numeric(14, 2), nullable=False),
        sa.Column('contractor_workers_count', sa.Integer(), nullable=True),
        sa.Column('remarks', sa.String(500), nullable=True),
        sa.UniqueConstraint('dpr_header_id', 'worker_id', name='uq_dpr_labour_header_worker'),
    )
    op.create_index('ix_dpr_labour_dpr_header_id', 'dpr_labour', ['dpr_header_id'])
    op.create_index('ix_dpr_labour_worker_id', 'dpr_labour', ['worker_id'])

    # Worker payments / ledger
    op.create_table(
        'worker_payments',
        sa.Column('id', sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column('worker_id', sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('workers.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('project_id', sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('projects.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('payment_date', sa.Date(), nullable=False),
        sa.Column('payment_type', sa.String(20), nullable=False),
        sa.Column('amount', sa.Numeric(14, 2), nullable=False),
        sa.Column('remarks', sa.String(500), nullable=True),
        sa.Column('recorded_by', sa.dialects.postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='RESTRICT'), nullable=False),
        sa.CheckConstraint('amount > 0', name='ck_worker_payment_amount_positive'),
    )
    op.create_index('ix_worker_payments_worker_id', 'worker_payments', ['worker_id'])
    op.create_index('ix_worker_payments_project_id', 'worker_payments', ['project_id'])


def downgrade() -> None:
    op.drop_index('ix_worker_payments_project_id', 'worker_payments')
    op.drop_index('ix_worker_payments_worker_id', 'worker_payments')
    op.drop_table('worker_payments')

    op.drop_index('ix_dpr_labour_worker_id', 'dpr_labour')
    op.drop_index('ix_dpr_labour_dpr_header_id', 'dpr_labour')
    op.drop_table('dpr_labour')

    op.drop_column('workers', 'default_rate')
    op.drop_column('workers', 'wage_unit')
    op.drop_column('workers', 'worker_type')
