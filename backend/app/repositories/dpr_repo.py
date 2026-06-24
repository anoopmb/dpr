import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.models.dpr import DprHeader, DprProductionEntry
from app.repositories.base import BaseRepository

_EAGER_LOAD = (
    selectinload(DprHeader.work_items),
    selectinload(DprHeader.issues),
    selectinload(DprHeader.materials),
    selectinload(DprHeader.machinery_entries),
)


class DprRepository(BaseRepository[DprHeader]):
    model = DprHeader

    async def get_with_children(self, header_id: uuid.UUID) -> DprHeader | None:
        result = await self.session.execute(
            select(DprHeader).options(*_EAGER_LOAD).where(DprHeader.id == header_id)
        )
        return result.scalar_one_or_none()

    async def get_by_project_and_date(self, project_id: uuid.UUID, report_date: date) -> DprHeader | None:
        result = await self.session.execute(
            select(DprHeader).where(DprHeader.project_id == project_id, DprHeader.report_date == report_date)
        )
        return result.scalar_one_or_none()

    async def list_for_project(self, project_id: uuid.UUID) -> list[DprHeader]:
        result = await self.session.execute(
            select(DprHeader).options(*_EAGER_LOAD).where(DprHeader.project_id == project_id)
        )
        return list(result.scalars().all())


class DprProductionRepository(BaseRepository[DprProductionEntry]):
    model = DprProductionEntry

    async def get_by_header_and_boq(
        self, header_id: uuid.UUID, boq_item_id: uuid.UUID
    ) -> DprProductionEntry | None:
        result = await self.session.execute(
            select(DprProductionEntry).where(
                DprProductionEntry.dpr_header_id == header_id,
                DprProductionEntry.boq_item_id == boq_item_id,
            )
        )
        return result.scalar_one_or_none()

    async def list_for_header(self, header_id: uuid.UUID) -> list[DprProductionEntry]:
        result = await self.session.execute(
            select(DprProductionEntry).where(DprProductionEntry.dpr_header_id == header_id)
        )
        return list(result.scalars().all())

    async def cumulative_by_project(
        self, project_id: uuid.UUID, as_of_date: date
    ) -> dict[uuid.UUID, tuple[Decimal, Decimal]]:
        result = await self.session.execute(
            select(
                DprProductionEntry.boq_item_id,
                func.coalesce(func.sum(DprProductionEntry.qty_today), 0).label("total_qty"),
                func.coalesce(func.sum(DprProductionEntry.amount_today), 0).label("total_amount"),
            )
            .join(DprHeader, DprProductionEntry.dpr_header_id == DprHeader.id)
            .where(DprHeader.project_id == project_id)
            .where(DprHeader.report_date <= as_of_date)
            .group_by(DprProductionEntry.boq_item_id)
        )
        return {row.boq_item_id: (row.total_qty, row.total_amount) for row in result}

    async def daily_by_project(
        self, project_id: uuid.UUID, from_date: date, to_date: date
    ) -> dict[tuple[uuid.UUID, date], tuple[Decimal, Decimal]]:
        result = await self.session.execute(
            select(
                DprProductionEntry.boq_item_id,
                DprHeader.report_date,
                DprProductionEntry.qty_today,
                DprProductionEntry.amount_today,
            )
            .join(DprHeader, DprProductionEntry.dpr_header_id == DprHeader.id)
            .where(DprHeader.project_id == project_id)
            .where(DprHeader.report_date >= from_date)
            .where(DprHeader.report_date <= to_date)
        )
        return {(row[0], row[1]): (row[2], row[3]) for row in result}
