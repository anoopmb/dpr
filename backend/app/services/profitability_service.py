import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.dpr import DprHeader, DprLabour, DprMachinery, DprMaterial, DprProductionEntry, DprStatus
from app.models.expense import Expense
from app.models.master_data import ExpenseCategoryMaster
from app.schemas.profitability import (
    DailyProfitabilityRead,
    ExpenseCategoryBreakdown,
    ProfitabilityRead,
)


class ProfitabilityService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, project_id: uuid.UUID, from_date: date, to_date: date) -> ProfitabilityRead:
        production_by_date = await self._production_by_date(project_id, from_date, to_date)
        machinery_by_date = await self._machinery_cost_by_date(project_id, from_date, to_date)
        material_by_date = await self._material_cost_by_date(project_id, from_date, to_date)
        labour_by_date = await self._labour_cost_by_date(project_id, from_date, to_date)
        expense_by_date = await self._expense_by_date(project_id, from_date, to_date)
        expense_by_category = await self._expense_by_category(project_id, from_date, to_date)

        all_dates = sorted(
            set(production_by_date) | set(machinery_by_date) | set(material_by_date)
            | set(labour_by_date) | set(expense_by_date)
        )

        daily: list[DailyProfitabilityRead] = []
        total_prod = Decimal(0)
        total_mach = Decimal(0)
        total_mat = Decimal(0)
        total_lab = Decimal(0)
        total_exp = Decimal(0)

        for d in all_dates:
            prod = production_by_date.get(d, Decimal(0))
            mach = machinery_by_date.get(d, Decimal(0))
            mat = material_by_date.get(d, Decimal(0))
            lab = labour_by_date.get(d, Decimal(0))
            exp = expense_by_date.get(d, Decimal(0))
            cost = mach + mat + lab + exp
            profit = prod - cost
            pct = (profit / prod * 100).quantize(Decimal("0.01")) if prod > 0 else None
            daily.append(
                DailyProfitabilityRead(
                    date=d,
                    production_value=prod,
                    machinery_cost=mach,
                    material_cost=mat,
                    labour_cost=lab,
                    expense_cost=exp,
                    total_cost=cost,
                    net_profit=profit,
                    profit_percent=pct,
                )
            )
            total_prod += prod
            total_mach += mach
            total_mat += mat
            total_lab += lab
            total_exp += exp

        total_cost = total_mach + total_mat + total_lab + total_exp
        net_profit = total_prod - total_cost
        profit_pct = (
            (net_profit / total_prod * 100).quantize(Decimal("0.01")) if total_prod > 0 else None
        )

        return ProfitabilityRead(
            from_date=from_date,
            to_date=to_date,
            production_value=total_prod,
            machinery_cost=total_mach,
            material_cost=total_mat,
            labour_cost=total_lab,
            expense_cost=total_exp,
            total_cost=total_cost,
            net_profit=net_profit,
            profit_percent=profit_pct,
            expense_by_category=expense_by_category,
            daily=daily,
        )

    async def _production_by_date(
        self, project_id: uuid.UUID, from_date: date, to_date: date
    ) -> dict[date, Decimal]:
        rows = await self.session.execute(
            select(DprHeader.report_date, func.coalesce(func.sum(DprProductionEntry.amount_today), 0))
            .outerjoin(DprProductionEntry, DprHeader.id == DprProductionEntry.dpr_header_id)
            .where(DprHeader.project_id == project_id)
            .where(DprHeader.report_date >= from_date)
            .where(DprHeader.report_date <= to_date)
            .group_by(DprHeader.report_date)
        )
        return {row[0]: Decimal(str(row[1])) for row in rows}

    async def _machinery_cost_by_date(
        self, project_id: uuid.UUID, from_date: date, to_date: date
    ) -> dict[date, Decimal]:
        rows = await self.session.execute(
            select(
                DprHeader.report_date,
                func.coalesce(func.sum(DprMachinery.quantity_used * DprMachinery.hire_rate), 0),
            )
            .join(DprMachinery, DprHeader.id == DprMachinery.dpr_header_id)
            .where(DprHeader.project_id == project_id)
            .where(DprHeader.report_date >= from_date)
            .where(DprHeader.report_date <= to_date)
            .group_by(DprHeader.report_date)
        )
        return {row[0]: Decimal(str(row[1])) for row in rows}

    async def _material_cost_by_date(
        self, project_id: uuid.UUID, from_date: date, to_date: date
    ) -> dict[date, Decimal]:
        rows = await self.session.execute(
            select(
                DprHeader.report_date,
                func.coalesce(func.sum(DprMaterial.qty_consumed * DprMaterial.rate), 0),
            )
            .join(DprMaterial, DprHeader.id == DprMaterial.dpr_header_id)
            .where(DprHeader.project_id == project_id)
            .where(DprHeader.report_date >= from_date)
            .where(DprHeader.report_date <= to_date)
            .group_by(DprHeader.report_date)
        )
        return {row[0]: Decimal(str(row[1])) for row in rows}

    async def _labour_cost_by_date(
        self, project_id: uuid.UUID, from_date: date, to_date: date
    ) -> dict[date, Decimal]:
        rows = await self.session.execute(
            select(
                DprHeader.report_date,
                func.coalesce(func.sum(DprLabour.amount), 0),
            )
            .join(DprLabour, DprHeader.id == DprLabour.dpr_header_id)
            .where(
                DprHeader.project_id == project_id,
                DprHeader.report_date >= from_date,
                DprHeader.report_date <= to_date,
                DprHeader.status == DprStatus.APPROVED,
            )
            .group_by(DprHeader.report_date)
        )
        return {row[0]: Decimal(str(row[1])) for row in rows}

    async def _expense_by_date(
        self, project_id: uuid.UUID, from_date: date, to_date: date
    ) -> dict[date, Decimal]:
        rows = await self.session.execute(
            select(Expense.expense_date, func.coalesce(func.sum(Expense.amount), 0))
            .where(Expense.project_id == project_id)
            .where(Expense.expense_date >= from_date)
            .where(Expense.expense_date <= to_date)
            .group_by(Expense.expense_date)
        )
        return {row[0]: Decimal(str(row[1])) for row in rows}

    async def _expense_by_category(
        self, project_id: uuid.UUID, from_date: date, to_date: date
    ) -> list[ExpenseCategoryBreakdown]:
        rows = await self.session.execute(
            select(ExpenseCategoryMaster.name, func.coalesce(func.sum(Expense.amount), 0))
            .join(Expense, Expense.expense_category_id == ExpenseCategoryMaster.id)
            .where(Expense.project_id == project_id)
            .where(Expense.expense_date >= from_date)
            .where(Expense.expense_date <= to_date)
            .group_by(ExpenseCategoryMaster.name)
            .order_by(ExpenseCategoryMaster.name)
        )
        return [
            ExpenseCategoryBreakdown(category_name=row[0], amount=Decimal(str(row[1])))
            for row in rows
        ]
