import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, status

from app.api.deps import CurrentUserDep, SessionDep, require_role
from app.models.user import UserRole
from app.schemas.billing import (
    PaymentReceivedCreate,
    PaymentReceivedRead,
    RunningBillCreate,
    RunningBillRead,
)
from app.services.billing_service import BillingService

router = APIRouter(prefix="/running-bills", tags=["billing"])

_BILLING_ROLES = (UserRole.QUANTITY_SURVEYOR, UserRole.PROJECT_MANAGER, UserRole.ADMIN)


@router.post(
    "",
    response_model=RunningBillRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*_BILLING_ROLES))],
)
async def create_bill(data: RunningBillCreate, session: SessionDep, current_user: CurrentUserDep) -> RunningBillRead:
    bill = await BillingService(session).create_bill(data, generated_by=uuid.UUID(current_user.id))
    return RunningBillRead.model_validate(bill)


@router.get("/by-project/{project_id}", response_model=list[RunningBillRead])
async def list_bills_for_project(project_id: uuid.UUID, session: SessionDep, _: CurrentUserDep) -> list[RunningBillRead]:
    bills = await BillingService(session).list_for_project(project_id)
    return [RunningBillRead.model_validate(b) for b in bills]


@router.get("/{bill_id}", response_model=RunningBillRead)
async def get_bill(bill_id: uuid.UUID, session: SessionDep, _: CurrentUserDep) -> RunningBillRead:
    bill = await BillingService(session).get(bill_id)
    return RunningBillRead.model_validate(bill)


@router.post(
    "/{bill_id}/payments",
    response_model=PaymentReceivedRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*_BILLING_ROLES))],
)
async def record_payment(
    bill_id: uuid.UUID,
    data: PaymentReceivedCreate,
    session: SessionDep,
    current_user: CurrentUserDep,
    background_tasks: BackgroundTasks,
) -> PaymentReceivedRead:
    payment = await BillingService(session, background_tasks).record_payment(
        bill_id, data, recorded_by=uuid.UUID(current_user.id)
    )
    return PaymentReceivedRead.model_validate(payment)


@router.get("/{bill_id}/payments", response_model=list[PaymentReceivedRead])
async def list_payments(bill_id: uuid.UUID, session: SessionDep, _: CurrentUserDep) -> list[PaymentReceivedRead]:
    payments = await BillingService(session).list_payments(bill_id)
    return [PaymentReceivedRead.model_validate(p) for p in payments]
