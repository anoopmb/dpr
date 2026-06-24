from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class ExpenseCategoryBreakdown(BaseModel):
    category_name: str
    amount: Decimal


class DailyProfitabilityRead(BaseModel):
    date: date
    production_value: Decimal
    machinery_cost: Decimal
    material_cost: Decimal
    expense_cost: Decimal
    total_cost: Decimal
    net_profit: Decimal
    profit_percent: Decimal | None


class ProfitabilityRead(BaseModel):
    from_date: date
    to_date: date
    production_value: Decimal
    machinery_cost: Decimal
    material_cost: Decimal
    expense_cost: Decimal
    total_cost: Decimal
    net_profit: Decimal
    profit_percent: Decimal | None
    expense_by_category: list[ExpenseCategoryBreakdown]
    daily: list[DailyProfitabilityRead]
