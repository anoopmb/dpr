import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class WorkerEarningsRow(BaseModel):
    worker_id: uuid.UUID
    worker_name: str
    category_id: uuid.UUID
    category_name: str
    days_present: int
    daily_rate: Decimal | None
    total_earnings: Decimal | None


class WorkerEarningsReportRead(BaseModel):
    project_id: uuid.UUID
    from_date: date
    to_date: date
    rows: list[WorkerEarningsRow]
    total_days_present: int
    total_earnings: Decimal


class DailyLabourLogRow(BaseModel):
    attendance_date: date
    worker_id: uuid.UUID
    worker_name: str
    category_id: uuid.UUID
    category_name: str
    daily_rate: Decimal | None
    cost: Decimal | None


class DailyLabourLogReportRead(BaseModel):
    project_id: uuid.UUID
    from_date: date
    to_date: date
    rows: list[DailyLabourLogRow]
    total_cost: Decimal
