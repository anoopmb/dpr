import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, PermissionDeniedError
from app.models.audit import AuditAction
from app.models.dpr import DprHeader, DprLabour, DprStatus
from app.models.worker import Worker
from app.models.worker_payment import WorkerPayment, WorkerPaymentType
from app.schemas.worker_payment import (
    WorkerLedgerRead,
    WorkerLedgerSummaryRow,
    WorkerPaymentCreate,
    WorkerPaymentRead,
)
from app.services.audit_service import AuditService, serialize_model


class WorkerLedgerService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.audit = AuditService(session)

    async def _resolve_worker(self, worker_id: uuid.UUID) -> Worker:
        worker = await self.session.get(Worker, worker_id)
        if worker is None:
            raise NotFoundError(f"Worker {worker_id} not found.")
        return worker

    async def _earned(self, project_id: uuid.UUID, worker_id: uuid.UUID) -> Decimal:
        result = await self.session.execute(
            select(func.coalesce(func.sum(DprLabour.amount), 0))
            .join(DprHeader, DprLabour.dpr_header_id == DprHeader.id)
            .where(
                DprHeader.project_id == project_id,
                DprLabour.worker_id == worker_id,
                DprHeader.status == DprStatus.APPROVED,
            )
        )
        return Decimal(str(result.scalar_one()))

    async def _payments_sum(self, project_id: uuid.UUID, worker_id: uuid.UUID, payment_type: WorkerPaymentType) -> Decimal:
        result = await self.session.execute(
            select(func.coalesce(func.sum(WorkerPayment.amount), 0))
            .where(
                WorkerPayment.project_id == project_id,
                WorkerPayment.worker_id == worker_id,
                WorkerPayment.payment_type == payment_type,
            )
        )
        return Decimal(str(result.scalar_one()))

    async def get_ledger(self, project_id: uuid.UUID, worker_id: uuid.UUID) -> WorkerLedgerRead:
        worker = await self._resolve_worker(worker_id)
        total_earned = await self._earned(project_id, worker_id)
        total_advance = await self._payments_sum(project_id, worker_id, WorkerPaymentType.ADVANCE)
        total_payment = await self._payments_sum(project_id, worker_id, WorkerPaymentType.PAYMENT)
        total_paid = total_advance + total_payment
        total_deducted = await self._payments_sum(project_id, worker_id, WorkerPaymentType.DEDUCTION)
        balance_pending = total_earned - total_paid + total_deducted

        payments_result = await self.session.execute(
            select(WorkerPayment)
            .where(WorkerPayment.project_id == project_id, WorkerPayment.worker_id == worker_id)
            .order_by(WorkerPayment.payment_date.desc(), WorkerPayment.created_at.desc())
        )
        payments = [WorkerPaymentRead.model_validate(p) for p in payments_result.scalars().all()]

        return WorkerLedgerRead(
            worker_id=worker_id,
            worker_name=worker.full_name,
            worker_type=worker.worker_type,
            wage_unit=worker.wage_unit,
            project_id=project_id,
            total_earned=total_earned,
            total_paid=total_paid,
            total_deducted=total_deducted,
            balance_pending=balance_pending,
            payments=payments,
        )

    async def list_summary(self, project_id: uuid.UUID) -> list[WorkerLedgerSummaryRow]:
        workers_result = await self.session.execute(
            select(Worker).where(Worker.project_id == project_id, Worker.is_active == True).order_by(Worker.full_name)
        )
        workers = list(workers_result.scalars().all())

        rows: list[WorkerLedgerSummaryRow] = []
        for worker in workers:
            total_earned = await self._earned(project_id, worker.id)
            total_advance = await self._payments_sum(project_id, worker.id, WorkerPaymentType.ADVANCE)
            total_payment = await self._payments_sum(project_id, worker.id, WorkerPaymentType.PAYMENT)
            total_paid = total_advance + total_payment
            total_deducted = await self._payments_sum(project_id, worker.id, WorkerPaymentType.DEDUCTION)
            balance_pending = total_earned - total_paid + total_deducted
            rows.append(
                WorkerLedgerSummaryRow(
                    worker_id=worker.id,
                    worker_name=worker.full_name,
                    worker_type=worker.worker_type,
                    wage_unit=worker.wage_unit,
                    total_earned=total_earned,
                    total_paid=total_paid,
                    total_deducted=total_deducted,
                    balance_pending=balance_pending,
                )
            )
        return rows

    async def add_payment(self, data: WorkerPaymentCreate, actor_id: uuid.UUID) -> WorkerPayment:
        if data.payment_type not in (WorkerPaymentType.ADVANCE, WorkerPaymentType.PAYMENT, WorkerPaymentType.DEDUCTION):
            raise PermissionDeniedError(f"Invalid payment_type: {data.payment_type}")
        payment = WorkerPayment(
            worker_id=data.worker_id,
            project_id=data.project_id,
            payment_date=data.payment_date,
            payment_type=data.payment_type,
            amount=data.amount,
            remarks=data.remarks,
            recorded_by=actor_id,
        )
        self.session.add(payment)
        await self.session.flush()
        await self.audit.record(
            entity_type="WORKER_PAYMENT",
            entity_id=payment.id,
            action=AuditAction.CREATE,
            actor_id=actor_id,
            after=serialize_model(payment),
        )
        await self.session.commit()
        return payment

    async def delete_payment(self, payment_id: uuid.UUID, actor_id: uuid.UUID) -> None:
        payment = await self.session.get(WorkerPayment, payment_id)
        if payment is None:
            raise NotFoundError(f"Worker payment {payment_id} not found.")
        before = serialize_model(payment)
        await self.session.delete(payment)
        await self.audit.record(
            entity_type="WORKER_PAYMENT",
            entity_id=payment_id,
            action=AuditAction.DELETE,
            actor_id=actor_id,
            before=before,
        )
        await self.session.commit()
