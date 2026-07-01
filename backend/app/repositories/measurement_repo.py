import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.models.measurement import Measurement
from app.repositories.base import BaseRepository


class MeasurementRepository(BaseRepository[Measurement]):
    model = Measurement

    async def list_for_project_and_date(self, project_id: uuid.UUID, measurement_date: date) -> list[Measurement]:
        result = await self.session.execute(
            select(Measurement)
            .where(
                Measurement.project_id == project_id,
                Measurement.measurement_date == measurement_date,
            )
            .options(selectinload(Measurement.steel_lines))
        )
        return list(result.scalars().all())

    async def list_for_project(self, project_id: uuid.UUID) -> list[Measurement]:
        result = await self.session.execute(
            select(Measurement)
            .where(Measurement.project_id == project_id)
            .options(selectinload(Measurement.steel_lines))
        )
        return list(result.scalars().all())

    async def sum_qty_and_amount_for_item_date(
        self, boq_item_id: uuid.UUID, measurement_date: date
    ) -> tuple[Decimal, Decimal]:
        """Sum of computed_qty and computed_qty * rate across every measurement
        on this BOQ item/date. Uses the rate snapshotted at creation time."""
        result = await self.session.execute(
            select(
                func.coalesce(func.sum(Measurement.computed_qty), 0),
                func.coalesce(func.sum(Measurement.computed_qty * Measurement.rate), 0),
            )
            .where(
                Measurement.boq_item_id == boq_item_id,
                Measurement.measurement_date == measurement_date,
            )
        )
        qty, amount = result.one()
        return Decimal(str(qty)), Decimal(str(amount))

    async def list_boq_item_ids_for_project_date(
        self, project_id: uuid.UUID, measurement_date: date
    ) -> set[uuid.UUID]:
        """BOQ items with a measurement on this project/date. Once a BOQ item
        has a measurement, manual production entry for it is locked out."""
        result = await self.session.execute(
            select(Measurement.boq_item_id).where(
                Measurement.project_id == project_id,
                Measurement.measurement_date == measurement_date,
            )
        )
        return set(result.scalars().all())
