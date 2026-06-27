import uuid

from fastapi import APIRouter, Depends, status

from app.api.deps import CurrentUserDep, SessionDep, require_role
from app.models.user import UserRole
from app.schemas.expense import ExpenseCreate, ExpenseRead, ExpenseUpdate
from app.services.expense_service import ExpenseService

router = APIRouter(prefix="/expenses", tags=["expenses"])

_RECORDER_ROLES = (UserRole.SITE_ENGINEER, UserRole.PROJECT_MANAGER, UserRole.STORE_KEEPER, UserRole.ADMIN)


@router.post(
    "",
    response_model=ExpenseRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*_RECORDER_ROLES))],
)
async def create_expense(data: ExpenseCreate, session: SessionDep, current_user: CurrentUserDep) -> ExpenseRead:
    expense = await ExpenseService(session).create(data, paid_by=uuid.UUID(current_user.id))
    return ExpenseRead.model_validate(expense)


@router.patch(
    "/{expense_id}",
    response_model=ExpenseRead,
    dependencies=[Depends(require_role(*_RECORDER_ROLES))],
)
async def update_expense(
    expense_id: uuid.UUID, data: ExpenseUpdate, session: SessionDep, current_user: CurrentUserDep
) -> ExpenseRead:
    expense = await ExpenseService(session).update(expense_id, data, actor_id=uuid.UUID(current_user.id))
    return ExpenseRead.model_validate(expense)


@router.delete(
    "/{expense_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(*_RECORDER_ROLES))],
)
async def delete_expense(expense_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep) -> None:
    await ExpenseService(session).delete(expense_id, actor_id=uuid.UUID(current_user.id))


@router.get("/by-project/{project_id}", response_model=list[ExpenseRead])
async def list_expenses_for_project(project_id: uuid.UUID, session: SessionDep, _: CurrentUserDep) -> list[ExpenseRead]:
    expenses = await ExpenseService(session).list_for_project(project_id)
    return [ExpenseRead.model_validate(e) for e in expenses]


@router.get("/by-header/{dpr_header_id}", response_model=list[ExpenseRead])
async def list_expenses_for_header(dpr_header_id: uuid.UUID, session: SessionDep, _: CurrentUserDep) -> list[ExpenseRead]:
    expenses = await ExpenseService(session).list_for_header(dpr_header_id)
    return [ExpenseRead.model_validate(e) for e in expenses]


@router.get("/{expense_id}", response_model=ExpenseRead)
async def get_expense(expense_id: uuid.UUID, session: SessionDep, _: CurrentUserDep) -> ExpenseRead:
    expense = await ExpenseService(session).get(expense_id)
    return ExpenseRead.model_validate(expense)
