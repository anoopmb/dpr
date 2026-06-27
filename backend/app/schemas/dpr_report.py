import uuid
from decimal import Decimal

from pydantic import BaseModel


class DailyProductionCell(BaseModel):
    day: int
    qty: Decimal
    amount: Decimal


class DprReportItemRead(BaseModel):
    boq_item_id: uuid.UUID
    item_no: str
    description: str
    unit: str
    rate: Decimal
    current_rate: Decimal
    agreed_qty: Decimal
    current_tendered_qty: Decimal
    opening_qty: Decimal
    opening_amount: Decimal
    daily: list[DailyProductionCell]
    closing_qty: Decimal
    closing_amount: Decimal


class DprReportSectionRead(BaseModel):
    section_id: uuid.UUID | None
    section_no: str | None
    section_name: str
    items: list[DprReportItemRead]
    section_agreed_amount: Decimal
    section_closing_amount: Decimal


class DailyAmountCell(BaseModel):
    """Like DailyProductionCell but amount-only — for expense line items
    that have no meaningful quantity unit (e.g. "Food", "Fuel")."""

    day: int
    amount: Decimal


class MaterialConsumptionRow(BaseModel):
    material_id: uuid.UUID
    name: str
    unit: str
    daily: list[DailyProductionCell]
    total_qty: Decimal
    total_amount: Decimal


class MachineryUsageRow(BaseModel):
    machinery_id: uuid.UUID
    name: str
    unit: str
    daily: list[DailyProductionCell]
    total_qty: Decimal
    total_amount: Decimal


class LabourRow(BaseModel):
    """qty = count of distinct workers present that day in this category;
    amount = qty x WorkerCategoryMaster.daily_rate."""

    worker_category_id: uuid.UUID
    name: str
    daily_rate: Decimal | None
    daily: list[DailyProductionCell]
    total_qty: Decimal
    total_amount: Decimal


class ExpenseCategoryRow(BaseModel):
    expense_category_id: uuid.UUID
    name: str
    daily: list[DailyAmountCell]
    total_amount: Decimal


class DailySummaryCell(BaseModel):
    day: int
    income: Decimal
    expense: Decimal
    profit_loss: Decimal
    # Net profit / total expense x 100 — undefined (None) when that day's
    # expense is zero, matching the source spreadsheet's blank cells there.
    profit_loss_pct: Decimal | None
    # Running total from the project's start_date through this day —
    # exposed on every day; the frontend only displays it at week
    # boundaries, matching the source report's "Total from <start> to
    # <date>" column that appears once per week.
    cumulative_income: Decimal
    cumulative_expense: Decimal


class DprMonthlyReportRead(BaseModel):
    project_id: uuid.UUID
    month: str
    days_in_month: int
    sections: list[DprReportSectionRead]
    total_agreed_amount: Decimal
    total_closing_amount: Decimal
    materials: list[MaterialConsumptionRow]
    machinery: list[MachineryUsageRow]
    labour: list[LabourRow]
    expenses: list[ExpenseCategoryRow]
    summary: list[DailySummaryCell]
