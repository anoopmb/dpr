import uuid
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.domain.dpr.locking import assert_dpr_editable
from app.models.audit import AuditAction
from app.models.dpr import DprHeader
from app.models.expense import Expense
from app.models.user import UserRole
from app.repositories.expense_repo import ExpenseRepository
from app.schemas.expense import ExpenseCreate, ExpenseUpdate
from app.services.audit_service import AuditService, serialize_model


class ExpenseService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = ExpenseRepository(session)
        self.audit = AuditService(session)

    async def _check_header_lock(self, dpr_header_id: uuid.UUID | None, actor_role: UserRole) -> bool:
        # An expense not linked to any DPR (dpr_header_id is nullable) has
        # nothing to lock against.
        if dpr_header_id is None:
            return False
        header = await self.session.get(DprHeader, dpr_header_id)
        return assert_dpr_editable(header.status if header else None, actor_role)

    async def create(self, data: ExpenseCreate, paid_by: uuid.UUID, actor_role: UserRole) -> Expense:
        is_bypass_edit = await self._check_header_lock(data.dpr_header_id, actor_role)
        expense = Expense(
            **data.model_dump(),
            paid_by=paid_by,
            edited_by=paid_by if is_bypass_edit else None,
            edited_at=datetime.now(timezone.utc) if is_bypass_edit else None,
        )
        self.repo.add(expense)
        await self.session.flush()
        await self.audit.record(
            entity_type="EXPENSE",
            entity_id=expense.id,
            action=AuditAction.CREATE,
            actor_id=paid_by,
            after=serialize_model(expense),
        )
        await self.session.commit()
        await self.session.refresh(expense)
        return expense

    async def update(
        self, expense_id: uuid.UUID, data: ExpenseUpdate, actor_id: uuid.UUID, actor_role: UserRole
    ) -> Expense:
        expense = await self.get(expense_id)
        is_bypass_edit = await self._check_header_lock(expense.dpr_header_id, actor_role)
        before = serialize_model(expense)
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(expense, field, value)
        if is_bypass_edit:
            expense.edited_by = actor_id
            expense.edited_at = datetime.now(timezone.utc)
        await self.session.flush()
        await self.audit.record(
            entity_type="EXPENSE",
            entity_id=expense.id,
            action=AuditAction.UPDATE,
            actor_id=actor_id,
            before=before,
            after=serialize_model(expense),
        )
        await self.session.commit()
        await self.session.refresh(expense)
        return expense

    async def delete(self, expense_id: uuid.UUID, actor_id: uuid.UUID, actor_role: UserRole) -> None:
        expense = await self.get(expense_id)
        await self._check_header_lock(expense.dpr_header_id, actor_role)
        before = serialize_model(expense)
        entity_id = expense.id
        await self.session.delete(expense)
        await self.audit.record(
            entity_type="EXPENSE",
            entity_id=entity_id,
            action=AuditAction.DELETE,
            actor_id=actor_id,
            before=before,
        )
        await self.session.commit()

    async def list_for_project(self, project_id: uuid.UUID) -> list[Expense]:
        return await self.repo.list_for_project(project_id)

    async def list_for_header(self, dpr_header_id: uuid.UUID) -> list[Expense]:
        return await self.repo.list_for_header(dpr_header_id)

    async def get(self, expense_id: uuid.UUID) -> Expense:
        expense = await self.repo.get(expense_id)
        if expense is None:
            raise NotFoundError(f"Expense {expense_id} not found.")
        return expense
