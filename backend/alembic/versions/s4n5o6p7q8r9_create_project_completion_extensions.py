"""create project_completion_extensions

Revision ID: s4n5o6p7q8r9
Revises: r3m4n5o6p7q8
Create Date: 2026-07-15

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = 's4n5o6p7q8r9'
down_revision = 'r3m4n5o6p7q8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'project_completion_extensions',
        sa.Column('id', UUID(as_uuid=True), primary_key=True),
        sa.Column('project_id', UUID(as_uuid=True), sa.ForeignKey('projects.id', ondelete='CASCADE'), nullable=False),
        sa.Column('previous_completion_date', sa.Date(), nullable=False),
        sa.Column('new_completion_date', sa.Date(), nullable=False),
        sa.Column('reason', sa.String(length=500), nullable=True),
        sa.Column('extended_by', UUID(as_uuid=True), sa.ForeignKey('users.id', ondelete='RESTRICT'), nullable=False),
        sa.Column('extended_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        'ix_project_completion_extensions_project_id',
        'project_completion_extensions',
        ['project_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_project_completion_extensions_project_id', table_name='project_completion_extensions')
    op.drop_table('project_completion_extensions')
