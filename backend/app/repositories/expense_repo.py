import uuid

from sqlalchemy import select

from app.models.expense import Expense
from app.repositories.base import BaseRepository


class ExpenseRepository(BaseRepository[Expense]):
    model = Expense

    async def list_for_project(self, project_id: uuid.UUID) -> list[Expense]:
        result = await self.session.execute(select(Expense).where(Expense.project_id == project_id))
        return list(result.scalars().all())
