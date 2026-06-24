import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select

from app.models.measurement import Measurement, MeasurementStatus
from app.repositories.base import BaseRepository


class MeasurementRepository(BaseRepository[Measurement]):
    model = Measurement

    async def list_for_project(self, project_id: uuid.UUID) -> list[Measurement]:
        result = await self.session.execute(
            select(Measurement).where(Measurement.project_id == project_id)
        )
        return list(result.scalars().all())

    async def sum_computed_qty_for_item_date(self, boq_item_id: uuid.UUID, measurement_date: date) -> Decimal:
        """Sum of computed_qty across all non-rejected measurements for this
        BOQ item on this date — the live total that feeds the DPR production
        entry for the same item/date."""
        result = await self.session.execute(
            select(func.coalesce(func.sum(Measurement.computed_qty), 0)).where(
                Measurement.boq_item_id == boq_item_id,
                Measurement.measurement_date == measurement_date,
                Measurement.status != MeasurementStatus.REJECTED,
            )
        )
        return Decimal(str(result.scalar_one()))
