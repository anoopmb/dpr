import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class DprLabourCreate(BaseModel):
    worker_id: uuid.UUID
    quantity: Decimal = Field(ge=0)
    rate: Decimal = Field(ge=0)
    contractor_workers_count: int | None = Field(default=None, ge=0)
    remarks: str | None = Field(default=None, max_length=500)


class DprLabourUpdate(BaseModel):
    quantity: Decimal | None = Field(default=None, ge=0)
    rate: Decimal | None = Field(default=None, ge=0)
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
    contractor_workers_count: int | None
    remarks: str | None


class DprLabourSuggestion(BaseModel):
    """Pre-fill hint derived from attendance + worker master for one worker."""

    worker_id: uuid.UUID
    worker_name: str
    worker_type: str
    wage_unit: str | None
    quantity: Decimal
    rate: Decimal
    amount: Decimal
