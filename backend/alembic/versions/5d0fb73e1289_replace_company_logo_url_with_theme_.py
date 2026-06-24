"""replace company_logo_url with theme-aware logo and favicon fields

Revision ID: 5d0fb73e1289
Revises: c2d3e4f5a6b7
Create Date: 2026-06-24 21:37:08.917881

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5d0fb73e1289'
down_revision: Union[str, None] = 'c2d3e4f5a6b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('organization_settings', sa.Column('company_logo_light_url', sa.String(length=500), nullable=True))
    op.add_column('organization_settings', sa.Column('company_logo_dark_url', sa.String(length=500), nullable=True))
    op.add_column('organization_settings', sa.Column('company_logo_small_light_url', sa.String(length=500), nullable=True))
    op.add_column('organization_settings', sa.Column('company_logo_small_dark_url', sa.String(length=500), nullable=True))
    op.add_column('organization_settings', sa.Column('favicon_url', sa.String(length=500), nullable=True))
    op.drop_column('organization_settings', 'company_logo_url')


def downgrade() -> None:
    op.add_column('organization_settings', sa.Column('company_logo_url', sa.VARCHAR(length=500), autoincrement=False, nullable=True))
    op.drop_column('organization_settings', 'favicon_url')
    op.drop_column('organization_settings', 'company_logo_small_dark_url')
    op.drop_column('organization_settings', 'company_logo_small_light_url')
    op.drop_column('organization_settings', 'company_logo_dark_url')
    op.drop_column('organization_settings', 'company_logo_light_url')
