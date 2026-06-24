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
    agreed_qty: Decimal
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


class DprMonthlyReportRead(BaseModel):
    project_id: uuid.UUID
    month: str
    days_in_month: int
    sections: list[DprReportSectionRead]
    total_agreed_amount: Decimal
    total_closing_amount: Decimal
