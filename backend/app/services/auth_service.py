from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError
from app.core.security import verify_password
from app.models.user import User
from app.repositories.user_repo import UserRepository


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = UserRepository(session)

    async def authenticate(self, login_id: str, password: str) -> User:
        user = await self.repo.get_by_login_id(login_id)
        if user is None or not verify_password(password, user.hashed_password):
            raise AuthenticationError("Incorrect User ID or password.")
        if not user.is_active:
            raise AuthenticationError("User account is inactive.")
        return user
