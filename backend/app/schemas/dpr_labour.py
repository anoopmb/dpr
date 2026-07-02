import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class DprLabourCreate(BaseModel):
    worker_id: uuid.UUID
    quantity: Decimal = Field(ge=0)
    rate: Decimal = Field(ge=0)
    overtime_amount: Decimal | None = Field(default=None, ge=0)
    contractor_workers_count: int | None = Field(default=None, ge=0)
    remarks: str | None = Field(default=None, max_length=500)


class DprLabourUpdate(BaseModel):
    quantity: Decimal | None = Field(default=None, ge=0)
    rate: Decimal | None = Field(default=None, ge=0)
    overtime_amount: Decimal | None = Field(default=None, ge=0)
    contractor_workers_count: int | None = Field(default=None, ge=0)
    remarks: str | None = Field(default=None, max_length=500)


class DprLabourRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    dpr_header_id: uuid.UUID
    worker_id: uuid.UUID
    worker_name: str
    worker_type: str
    wage_unit: str | None
    quantity: Decimal
    rate: Decimal
    amount: Decimal
    overtime_amount: Decimal | None
    contractor_workers_count: int | None
    remarks: str | None
    edited_by: uuid.UUID | None = None
    edited_by_name: str | None = None
    edited_at: datetime | None = None


class DprLabourSuggestion(BaseModel):
    """Pre-fill hint derived from attendance + worker master for one worker."""

    worker_id: uuid.UUID
    worker_name: str
    worker_type: str
    wage_unit: str | None
    quantity: Decimal
    rate: Decimal
    amount: Decimal
