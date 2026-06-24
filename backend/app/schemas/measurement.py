import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.measurement import MeasurementStatus


class MeasurementCreate(BaseModel):
    project_id: uuid.UUID
    boq_item_id: uuid.UUID
    measurement_date: date
    dimensions: dict[str, Decimal] = Field(min_length=1)
    chainage: str | None = Field(default=None, max_length=100)


class MeasurementActionRequest(BaseModel):
    remarks: str | None = Field(default=None, max_length=500)


class MeasurementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    boq_item_id: uuid.UUID
    work_type_id: uuid.UUID
    measurement_date: date
    dimensions: dict[str, Decimal]
    computed_qty: Decimal
    status: MeasurementStatus
    recorded_by: uuid.UUID
    version: int
    superseded_by_id: uuid.UUID | None
    billed: bool
    chainage: str | None


class MeasurementApprovalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    measurement_id: uuid.UUID
    from_status: str
    to_status: str
    acted_by: uuid.UUID
    remarks: str | None
