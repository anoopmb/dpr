"""One-off script to create a test user for manual auth verification.

Usage: python -m scripts.seed_admin <login_id> <email> <password> [full_name] [role]
role defaults to ADMIN; valid values match UserRole (SITE_ENGINEER,
PROJECT_MANAGER, QUANTITY_SURVEYOR, STORE_KEEPER, ADMIN).
"""

import asyncio
import sys

from app.core.db import AsyncSessionLocal
from app.core.security import hash_password
from app.models.user import User, UserRole
from app.repositories.user_repo import UserRepository


async def main(login_id: str, email: str, password: str, full_name: str, role: UserRole) -> None:
    async with AsyncSessionLocal() as session:
        repo = UserRepository(session)
        existing = await repo.get_by_login_id(login_id)
        if existing is not None:
            print(f"User {login_id} already exists.")
            return

        user = User(
            login_id=login_id,
            full_name=full_name,
            email=email,
            hashed_password=hash_password(password),
            role=role,
        )
        repo.add(user)
        await session.commit()
        print(f"Created {role} user {login_id} ({email}).")


if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python -m scripts.seed_admin <login_id> <email> <password> [full_name] [role]")
        sys.exit(1)

    login_id_arg = sys.argv[1]
    email_arg = sys.argv[2]
    password_arg = sys.argv[3]
    full_name_arg = sys.argv[4] if len(sys.argv) > 4 else "Admin"
    role_arg = UserRole(sys.argv[5]) if len(sys.argv) > 5 else UserRole.ADMIN
    asyncio.run(main(login_id_arg, email_arg, password_arg, full_name_arg, role_arg))
