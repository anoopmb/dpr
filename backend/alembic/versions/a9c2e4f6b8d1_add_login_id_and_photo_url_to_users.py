"""add login_id and photo_url to users

Revision ID: a9c2e4f6b8d1
Revises: f1a3c5e7b9d2
Create Date: 2026-06-24

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a9c2e4f6b8d1"
down_revision: str | None = "f1a3c5e7b9d2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("login_id", sa.String(50), nullable=True))
    op.add_column("users", sa.Column("photo_url", sa.String(500), nullable=True))

    connection = op.get_bind()
    rows = connection.execute(sa.text("SELECT id, email FROM users")).fetchall()
    seen: set[str] = set()
    for row in rows:
        base = row.email.split("@")[0].lower()
        candidate = base
        suffix = 1
        while candidate in seen:
            suffix += 1
            candidate = f"{base}{suffix}"
        seen.add(candidate)
        connection.execute(
            sa.text("UPDATE users SET login_id = :login_id WHERE id = :id"),
            {"login_id": candidate, "id": row.id},
        )

    op.alter_column("users", "login_id", nullable=False)
    op.create_unique_constraint("uq_users_login_id", "users", ["login_id"])


def downgrade() -> None:
    op.drop_constraint("uq_users_login_id", "users", type_="unique")
    op.drop_column("users", "photo_url")
    op.drop_column("users", "login_id")
