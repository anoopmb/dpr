from sqlalchemy import select

from app.models.user import User
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    model = User

    async def get_by_email(self, email: str) -> User | None:
        result = await self.session.execute(select(User).where(User.email == email))
        return result.scalar_one_or_none()

    async def get_by_login_id(self, login_id: str) -> User | None:
        result = await self.session.execute(select(User).where(User.login_id == login_id))
        return result.scalar_one_or_none()

    async def list(self, limit: int = 200, offset: int = 0) -> list[User]:
        result = await self.session.execute(select(User).order_by(User.full_name).limit(limit).offset(offset))
        return list(result.scalars().all())
