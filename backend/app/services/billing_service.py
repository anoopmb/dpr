import uuid
from decimal import Decimal

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.domain.billing.validators import validate_measurement_billable, validate_payment_within_bill_total
from app.models.billing import BillStatus, PaymentReceived, RunningBill, RunningBillItem
from app.models.user import UserRole
from app.repositories.billing_repo import PaymentRepository, RunningBillRepository
from app.repositories.boq_repo import BoqRepository
from app.repositories.measurement_repo import MeasurementRepository
from app.schemas.billing import PaymentReceivedCreate, ProjectSummaryRead, RunningBillCreate
from app.services.notification_service import NotificationService
from app.services.project_assignment_service import ProjectAssignmentService

_BILLING_LINK = "/billing"


class BillingService:
    def __init__(self, session: AsyncSession, background_tasks: BackgroundTasks | None = None) -> None:
        self.session = session
        self.repo = RunningBillRepository(session)
        self.payment_repo = PaymentRepository(session)
        self.measurement_repo = MeasurementRepository(session)
        self.boq_repo = BoqRepository(session)
        self.notification_service = NotificationService(session, background_tasks)
        self.assignment_service = ProjectAssignmentService(session)

    async def create_bill(self, data: RunningBillCreate, generated_by: uuid.UUID) -> RunningBill:
        bill = RunningBill(
            project_id=data.project_id,
            bill_number=data.bill_number,
            bill_date=data.bill_date,
            from_date=data.from_date,
            to_date=data.to_date,
            total_amount=0,
            status=BillStatus.DRAFT,
            idempotency_key=str(uuid.uuid4()),
            generated_by=generated_by,
        )

        total = Decimal("0.00")
        for measurement_id in data.measurement_ids:
            measurement = await self.measurement_repo.get(measurement_id)
            if measurement is None or measurement.project_id != data.project_id:
                raise NotFoundError(f"Measurement {measurement_id} not found for this project.")

            validate_measurement_billable(measurement.status, measurement.billed)

            boq_item = await self.boq_repo.get(measurement.boq_item_id)
            if boq_item is None:
                raise NotFoundError(f"BOQ item for measurement {measurement_id} not found.")

            # Quantize explicitly to the column's declared scale (16,2) here
            # in Python — the session is created with expire_on_commit=False,
            # so relying on Postgres to round NUMERIC(16,2) on insert would
            # leave this in-memory object holding the unrounded value after
            # commit, drifting from what's actually stored.
            amount = (measurement.computed_qty * boq_item.rate).quantize(Decimal("0.01"))
            bill.items.append(
                RunningBillItem(
                    measurement_id=measurement.id,
                    boq_item_id=boq_item.id,
                    billed_qty=measurement.computed_qty,
                    rate=boq_item.rate,
                    amount=amount,
                )
            )
            measurement.billed = True
            total += amount

        bill.total_amount = total
        self.repo.add(bill)
        await self.session.commit()
        return await self.get(bill.id)

    async def list_for_project(self, project_id: uuid.UUID) -> list[RunningBill]:
        return await self.repo.list_for_project(project_id)

    async def get(self, bill_id: uuid.UUID) -> RunningBill:
        bill = await self.repo.get_with_items(bill_id)
        if bill is None:
            raise NotFoundError(f"Running bill {bill_id} not found.")
        return bill

    async def record_payment(
        self, bill_id: uuid.UUID, data: PaymentReceivedCreate, recorded_by: uuid.UUID
    ) -> PaymentReceived:
        bill = await self.get(bill_id)
        already_received = await self.payment_repo.sum_received(bill_id)
        validate_payment_within_bill_total(data.amount_received, already_received, bill.total_amount)

        payment = PaymentReceived(running_bill_id=bill_id, recorded_by=recorded_by, **data.model_dump())
        self.payment_repo.add(payment)

        reached_paid = already_received + data.amount_received == bill.total_amount
        if reached_paid:
            bill.status = BillStatus.PAID

        await self.session.commit()
        await self.session.refresh(payment)

        if reached_paid:
            pm_ids = await self.assignment_service.resolve_users_for_role(bill.project_id, UserRole.PROJECT_MANAGER)
            await self.notification_service.notify(
                list(set(pm_ids) | {bill.generated_by}),
                type="RUNNING_BILL_PAID",
                title="Running bill fully paid",
                message=f"Running bill {bill.bill_number} has been fully paid.",
                project_id=bill.project_id,
                link_url=_BILLING_LINK,
                related_entity_type="RUNNING_BILL",
                related_entity_id=bill.id,
            )
        return payment

    async def list_payments(self, bill_id: uuid.UUID) -> list[PaymentReceived]:
        return await self.payment_repo.list_for_bill(bill_id)

    async def get_project_summary(self, project_id: uuid.UUID, contract_value: Decimal) -> ProjectSummaryRead:
        total_billed = await self.repo.sum_for_project(project_id)
        total_received = await self.payment_repo.sum_received_for_project(project_id)
        return ProjectSummaryRead(
            project_id=project_id,
            contract_value=contract_value,
            total_billed=total_billed,
            total_received=total_received,
            outstanding=total_billed - total_received,
        )
