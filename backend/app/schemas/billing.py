import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.billing import BillStatus


class RunningBillCreate(BaseModel):
    project_id: uuid.UUID
    bill_number: str = Field(min_length=1, max_length=50)
    bill_date: date
    from_date: date
    to_date: date
    measurement_ids: list[uuid.UUID] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_dates(self) -> "RunningBillCreate":
        if self.to_date < self.from_date:
            raise ValueError("to_date must be on or after from_date")
        return self


class RunningBillItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    measurement_id: uuid.UUID
    boq_item_id: uuid.UUID
    billed_qty: Decimal
    rate: Decimal
    amount: Decimal


class RunningBillRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    bill_number: str
    bill_date: date
    from_date: date
    to_date: date
    total_amount: Decimal
    status: BillStatus
    generated_by: uuid.UUID
    items: list[RunningBillItemRead]


class PaymentReceivedCreate(BaseModel):
    amount_received: Decimal = Field(gt=0)
    received_date: date
    reference_no: str | None = Field(default=None, max_length=100)


class PaymentReceivedRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    running_bill_id: uuid.UUID
    amount_received: Decimal
    received_date: date
    reference_no: str | None
    recorded_by: uuid.UUID


class ProjectSummaryRead(BaseModel):
    project_id: uuid.UUID
    contract_value: Decimal
    total_billed: Decimal
    total_received: Decimal
    outstanding: Decimal
