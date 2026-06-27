import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class MeasurementCreate(BaseModel):
    project_id: uuid.UUID
    boq_item_id: uuid.UUID
    measurement_date: date
    dimensions: dict[str, Decimal] = Field(min_length=1)
    chainage: str | None = Field(default=None, max_length=100)
    rate: Decimal | None = Field(default=None, ge=0)


class MeasurementUpdate(BaseModel):
    dimensions: dict[str, Decimal] = Field(min_length=1)
    chainage: str | None = Field(default=None, max_length=100)
    rate: Decimal | None = Field(default=None, ge=0)


class MeasurementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    boq_item_id: uuid.UUID
    work_type_id: uuid.UUID
    measurement_date: date
    dimensions: dict[str, Decimal]
    computed_qty: Decimal
    status: str
    recorded_by: uuid.UUID
    recorded_by_name: str
    version: int
    superseded_by_id: uuid.UUID | None
    billed: bool
    chainage: str | None
    rate: Decimal | None
