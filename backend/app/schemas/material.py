import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.material import MaterialIndentStatus
from app.models.stock_location import StockLocationType


class MaterialIndentItemCreate(BaseModel):
    material_id: uuid.UUID
    uom_id: uuid.UUID
    requested_qty: Decimal = Field(gt=0)


class MaterialIndentCreate(BaseModel):
    requesting_project_id: uuid.UUID
    source_type: StockLocationType
    source_location_id: uuid.UUID
    needed_by_date: date | None = None
    items: list[MaterialIndentItemCreate] = Field(min_length=1)


class MaterialIndentItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    material_id: uuid.UUID
    uom_id: uuid.UUID
    requested_qty: Decimal
    issued_qty: Decimal
    received_qty: Decimal


class MaterialIndentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    requesting_project_id: uuid.UUID
    source_type: StockLocationType
    source_location_id: uuid.UUID
    requested_by: uuid.UUID
    status: MaterialIndentStatus
    approved_by: uuid.UUID | None
    approved_at: datetime | None
    needed_by_date: date | None
    items: list[MaterialIndentItemRead]


class MaterialIssueCreate(BaseModel):
    issued_qty: Decimal = Field(gt=0)
    vehicle_ref: str | None = Field(default=None, max_length=100)


class MaterialReceiptCreate(BaseModel):
    received_qty: Decimal = Field(gt=0)
    photo_url: str | None = Field(default=None, max_length=500)
    remarks: str | None = Field(default=None, max_length=500)
