import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class ExpenseCreate(BaseModel):
    project_id: uuid.UUID
    expense_category_id: uuid.UUID
    amount: Decimal = Field(gt=0)
    expense_date: date
    dpr_header_id: uuid.UUID | None = None
    vendor_name: str | None = Field(default=None, max_length=255)
    bill_photo_url: str | None = Field(default=None, max_length=500)
    remarks: str | None = Field(default=None, max_length=500)


class ExpenseUpdate(BaseModel):
    expense_category_id: uuid.UUID | None = None
    amount: Decimal | None = Field(default=None, gt=0)
    expense_date: date | None = None
    vendor_name: str | None = Field(default=None, max_length=255)
    bill_photo_url: str | None = Field(default=None, max_length=500)
    remarks: str | None = Field(default=None, max_length=500)


class ExpenseRead(ExpenseCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    paid_by: uuid.UUID
    dpr_header_id: uuid.UUID | None = None
