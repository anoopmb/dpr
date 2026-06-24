import uuid
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.models.billing import PaymentReceived, RunningBill
from app.repositories.base import BaseRepository


class RunningBillRepository(BaseRepository[RunningBill]):
    model = RunningBill

    async def get_with_items(self, bill_id: uuid.UUID) -> RunningBill | None:
        result = await self.session.execute(
            select(RunningBill).options(selectinload(RunningBill.items)).where(RunningBill.id == bill_id)
        )
        return result.scalar_one_or_none()

    async def list_for_project(self, project_id: uuid.UUID) -> list[RunningBill]:
        result = await self.session.execute(
            select(RunningBill).options(selectinload(RunningBill.items)).where(RunningBill.project_id == project_id)
        )
        return list(result.scalars().all())

    async def sum_for_project(self, project_id: uuid.UUID) -> Decimal:
        result = await self.session.execute(
            select(func.coalesce(func.sum(RunningBill.total_amount), 0)).where(
                RunningBill.project_id == project_id
            )
        )
        return result.scalar_one() or Decimal(0)


class PaymentRepository(BaseRepository[PaymentReceived]):
    model = PaymentReceived

    async def sum_received(self, running_bill_id: uuid.UUID) -> Decimal:
        result = await self.session.execute(
            select(PaymentReceived).where(PaymentReceived.running_bill_id == running_bill_id)
        )
        return sum((p.amount_received for p in result.scalars().all()), Decimal(0))

    async def sum_received_for_project(self, project_id: uuid.UUID) -> Decimal:
        result = await self.session.execute(
            select(func.coalesce(func.sum(PaymentReceived.amount_received), 0))
            .join(RunningBill, PaymentReceived.running_bill_id == RunningBill.id)
            .where(RunningBill.project_id == project_id)
        )
        return result.scalar_one() or Decimal(0)

    async def list_for_bill(self, running_bill_id: uuid.UUID) -> list[PaymentReceived]:
        result = await self.session.execute(
            select(PaymentReceived).where(PaymentReceived.running_bill_id == running_bill_id)
        )
        return list(result.scalars().all())
