import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select

from app.models.boq import BoqItem
from app.models.measurement import Measurement
from app.repositories.base import BaseRepository


class MeasurementRepository(BaseRepository[Measurement]):
    model = Measurement

    async def list_for_project_and_date(self, project_id: uuid.UUID, measurement_date: date) -> list[Measurement]:
        result = await self.session.execute(
            select(Measurement).where(
                Measurement.project_id == project_id,
                Measurement.measurement_date == measurement_date,
            )
        )
        return list(result.scalars().all())

    async def list_for_project(self, project_id: uuid.UUID) -> list[Measurement]:
        result = await self.session.execute(
            select(Measurement).where(Measurement.project_id == project_id)
        )
        return list(result.scalars().all())

    async def sum_qty_and_amount_for_item_date(
        self, boq_item_id: uuid.UUID, measurement_date: date, status_codes: list[str]
    ) -> tuple[Decimal, Decimal]:
        """Sum of computed_qty and computed_qty * rate (each measurement's own
        rate override if set, else the BOQ item's current rate) across every
        measurement on this BOQ item/date whose status is in `status_codes`
        (the caller resolves this from the project's effective workflow's
        levels flagged feeds_production). The amount reflects the rate that
        was actually recorded against each measurement, not just the BOQ
        item's present-day rate, so a later BOQ rate change doesn't
        retroactively alter already-approved amounts."""
        if not status_codes:
            return Decimal("0"), Decimal("0")
        result = await self.session.execute(
            select(
                func.coalesce(func.sum(Measurement.computed_qty), 0),
                func.coalesce(
                    func.sum(Measurement.computed_qty * func.coalesce(Measurement.rate, BoqItem.rate)), 0
                ),
            )
            .join(BoqItem, BoqItem.id == Measurement.boq_item_id)
            .where(
                Measurement.boq_item_id == boq_item_id,
                Measurement.measurement_date == measurement_date,
                Measurement.status.in_(status_codes),
            )
        )
        qty, amount = result.one()
        return Decimal(str(qty)), Decimal(str(amount))

    async def count_status_for_project_date(
        self, project_id: uuid.UUID, measurement_date: date, status_codes: list[str]
    ) -> int:
        """Count measurements on this project/date whose status is in
        `status_codes`. Used (with the caller-resolved "still pending full
        approval" codes) to block DPR submission until every measurement for
        the date has cleared its workflow."""
        if not status_codes:
            return 0
        result = await self.session.execute(
            select(func.count()).where(
                Measurement.project_id == project_id,
                Measurement.measurement_date == measurement_date,
                Measurement.status.in_(status_codes),
            )
        )
        return result.scalar_one()

    async def has_status_for_project_date(
        self, project_id: uuid.UUID, measurement_date: date, status_codes: list[str]
    ) -> bool:
        """Whether any measurement on this project/date has a status in
        `status_codes`. Used (with the caller-resolved final-approval codes)
        to block DPR deletion once measurements have been certified."""
        if not status_codes:
            return False
        result = await self.session.execute(
            select(func.count()).where(
                Measurement.project_id == project_id,
                Measurement.measurement_date == measurement_date,
                Measurement.status.in_(status_codes),
            )
        )
        return result.scalar_one() > 0

    async def list_boq_item_ids_for_project_date(
        self, project_id: uuid.UUID, measurement_date: date
    ) -> set[uuid.UUID]:
        """BOQ items with a measurement on this project/date, in any status.
        Once a BOQ item has a measurement, manual production entry for it is
        locked out — qty/amount must come from the Measurement Book sync."""
        result = await self.session.execute(
            select(Measurement.boq_item_id).where(
                Measurement.project_id == project_id,
                Measurement.measurement_date == measurement_date,
            )
        )
        return set(result.scalars().all())
