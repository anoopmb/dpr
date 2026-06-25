import uuid

from fastapi import APIRouter, Depends, status

from app.api.deps import CurrentUserDep, SessionDep, require_role
from app.models.user import UserRole
from app.schemas.worker_payment import (
    WorkerLedgerRead,
    WorkerLedgerSummaryRow,
    WorkerPaymentCreate,
    WorkerPaymentRead,
)
from app.services.worker_ledger_service import WorkerLedgerService

router = APIRouter(prefix="/worker-ledger", tags=["worker-ledger"])

_PM_ROLES = (UserRole.PROJECT_MANAGER, UserRole.ADMIN)


@router.get("/{project_id}/summary", response_model=list[WorkerLedgerSummaryRow])
async def get_ledger_summary(
    project_id: uuid.UUID, session: SessionDep, _: CurrentUserDep
) -> list[WorkerLedgerSummaryRow]:
    return await WorkerLedgerService(session).list_summary(project_id)


@router.get("/{project_id}/{worker_id}", response_model=WorkerLedgerRead)
async def get_worker_ledger(
    project_id: uuid.UUID, worker_id: uuid.UUID, session: SessionDep, _: CurrentUserDep
) -> WorkerLedgerRead:
    return await WorkerLedgerService(session).get_ledger(project_id, worker_id)


@router.post(
    "/payments",
    response_model=WorkerPaymentRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*_PM_ROLES))],
)
async def add_payment(
    data: WorkerPaymentCreate, session: SessionDep, current_user: CurrentUserDep
) -> WorkerPaymentRead:
    payment = await WorkerLedgerService(session).add_payment(data, actor_id=uuid.UUID(current_user.id))
    return WorkerPaymentRead.model_validate(payment)


@router.delete(
    "/payments/{payment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(*_PM_ROLES))],
)
async def delete_payment(
    payment_id: uuid.UUID, session: SessionDep, current_user: CurrentUserDep
) -> None:
    await WorkerLedgerService(session).delete_payment(payment_id, actor_id=uuid.UUID(current_user.id))
