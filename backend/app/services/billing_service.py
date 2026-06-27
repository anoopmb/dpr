import uuid
from decimal import Decimal

from fastapi import BackgroundTasks
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.domain.billing.validators import validate_measurement_billable, validate_payment_within_bill_total
from app.models.audit import AuditAction
from app.models.billing import BillStatus, PaymentReceived, RunningBill, RunningBillItem
from app.models.user import UserRole
from app.repositories.billing_repo import PaymentRepository, RunningBillRepository
from app.repositories.boq_repo import BoqRepository
from app.repositories.measurement_repo import MeasurementRepository
from app.schemas.billing import PaymentReceivedCreate, ProjectSummaryRead, RunningBillCreate
from app.services.audit_service import AuditService, serialize_model
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
        self.audit = AuditService(session)

    async def _cumulative_billed_qty(self, boq_item_id: uuid.UUID, exclude_bill_id: uuid.UUID | None = None) -> Decimal:
        from sqlalchemy import select as sa_select
        from app.models.billing import RunningBillItem as RBI
        q = (
            sa_select(func.coalesce(func.sum(RBI.billed_qty), 0))
            .join(RunningBill, RunningBill.id == RBI.running_bill_id)
            .where(RBI.boq_item_id == boq_item_id, RunningBill.status != BillStatus.DRAFT)
        )
        if exclude_bill_id:
            q = q.where(RBI.running_bill_id != exclude_bill_id)
        result = await self.session.execute(q)
        return Decimal(str(result.scalar_one()))

    def _cpwd_band_amounts(
        self,
        qty_this_bill: Decimal,
        original_tendered_qty: Decimal,
        previous_billed_qty: Decimal,
        original_rate: Decimal,
        revised_rate: Decimal,
    ) -> tuple[Decimal, Decimal]:
        """Returns (amount_at_original_rate, amount_at_revised_rate) for this bill's qty.

        CPWD rule: work within 110% of original agreed qty is billed at original contract rate.
        Work beyond that band is billed at the revised/market rate.
        """
        band_limit = (original_tendered_qty * Decimal("1.10")).quantize(Decimal("0.001"))
        band_remaining = max(Decimal("0"), band_limit - previous_billed_qty)
        qty_at_original = min(qty_this_bill, band_remaining)
        qty_at_revised = max(Decimal("0"), qty_this_bill - qty_at_original)
        amount_original = (qty_at_original * original_rate).quantize(Decimal("0.01"))
        amount_revised = (qty_at_revised * revised_rate).quantize(Decimal("0.01"))
        return amount_original, amount_revised

    async def create_bill(self, data: RunningBillCreate, generated_by: uuid.UUID) -> RunningBill:
        from app.services.boq_service import BoqService
        boq_svc = BoqService(self.session)

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

            measurement_rate = measurement.rate if measurement.rate is not None else boq_item.rate
            previous_billed_qty = await self._cumulative_billed_qty(boq_item.id)
            effective_rate = await boq_svc.get_effective_rate(boq_item.id, data.bill_date)

            if effective_rate != boq_item.rate:
                amt_original, amt_revised = self._cpwd_band_amounts(
                    qty_this_bill=measurement.computed_qty,
                    original_tendered_qty=boq_item.tendered_qty,
                    previous_billed_qty=previous_billed_qty,
                    original_rate=boq_item.rate,
                    revised_rate=effective_rate,
                )
                amount = amt_original + amt_revised
                bill_rate = measurement_rate
            else:
                amount = (measurement.computed_qty * measurement_rate).quantize(Decimal("0.01"))
                bill_rate = measurement_rate

            bill.items.append(
                RunningBillItem(
                    measurement_id=measurement.id,
                    boq_item_id=boq_item.id,
                    billed_qty=measurement.computed_qty,
                    rate=bill_rate,
                    amount=amount,
                )
            )
            measurement.billed = True
            total += amount

        bill.total_amount = total
        self.repo.add(bill)
        await self.session.flush()
        await self.audit.record(
            entity_type="RUNNING_BILL",
            entity_id=bill.id,
            action=AuditAction.CREATE,
            actor_id=generated_by,
            after=serialize_model(bill),
        )
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

        await self.session.flush()
        await self.audit.record(
            entity_type="PAYMENT",
            entity_id=payment.id,
            action=AuditAction.CREATE,
            actor_id=recorded_by,
            after=serialize_model(payment),
        )
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
