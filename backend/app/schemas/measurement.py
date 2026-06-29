import uuid
from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class SteelLineCreate(BaseModel):
    description: str = Field(min_length=1, max_length=200)
    diameter_mm: int = Field(ge=6, le=50)
    bar_count: Decimal = Field(gt=0)
    length_m: Decimal = Field(gt=0, description="Length in metres")


class SteelLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    description: str
    diameter_mm: int
    bar_count: Decimal
    length_m: Decimal
    coefficient: Decimal
    computed_weight_mt: Decimal


class AutoMaterialRead(BaseModel):
    material_id: uuid.UUID
    material_code: str
    material_name: str
    computed_qty: Decimal
    uom_code: str
    rate: Decimal | None
    manually_edited: bool


class MeasurementCreate(BaseModel):
    project_id: uuid.UUID
    boq_item_id: uuid.UUID
    measurement_date: date
    dimensions: dict[str, Decimal] = Field(default_factory=dict)
    chainage: str | None = Field(default=None, max_length=100)
    rate: Decimal | None = Field(default=None, ge=0)
    boq_template_id: uuid.UUID | None = None
    steel_lines: list[SteelLineCreate] = Field(default_factory=list)


class MeasurementUpdate(BaseModel):
    dimensions: dict[str, Decimal] = Field(default_factory=dict)
    chainage: str | None = Field(default=None, max_length=100)
    rate: Decimal | None = Field(default=None, ge=0)
    boq_template_id: uuid.UUID | None = None
    steel_lines: list[SteelLineCreate] = Field(default_factory=list)


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
    boq_template_id: uuid.UUID | None = None
    boq_template_name: str | None = None
    steel_lines: list[SteelLineRead] = []
    auto_materials: list[AutoMaterialRead] = []
