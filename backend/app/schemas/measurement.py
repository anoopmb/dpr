import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class SteelLineCreate(BaseModel):
    description: str | None = Field(default=None, max_length=200)
    diameter_mm: int = Field(ge=6, le=50)
    bar_count: Decimal = Field(gt=0)
    length_m: Decimal = Field(gt=0, description="Length in metres")


class SteelLineRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    description: str | None
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


_EXPRESSION_ALLOWED_FIELDS = {"l", "b", "d"}


def _validate_dimension_expression_keys(value: dict[str, str] | None) -> dict[str, str] | None:
    if value and (bad_keys := set(value) - _EXPRESSION_ALLOWED_FIELDS):
        raise ValueError(f"Expressions are only allowed for l/b/d dimensions, not: {sorted(bad_keys)}")
    return value


class MeasurementCreate(BaseModel):
    project_id: uuid.UUID
    boq_item_id: uuid.UUID
    measurement_date: date
    dimensions: dict[str, Decimal] = Field(default_factory=dict)
    # Raw expression text for whichever l/b/d fields were entered as an
    # expression (e.g. "(1+2.5)/2") rather than a plain number — server
    # re-evaluates and overwrites the matching `dimensions` entry, the
    # client-submitted decimal for that key is never trusted.
    dimension_expressions: dict[str, str] | None = None
    chainage: str | None = Field(default=None, max_length=100)
    rate: Decimal | None = Field(default=None, ge=0)
    boq_template_id: uuid.UUID | None = None
    steel_lines: list[SteelLineCreate] = Field(default_factory=list)
    notes: str | None = Field(default=None, max_length=1000)

    _validate_dimension_expressions = field_validator("dimension_expressions")(_validate_dimension_expression_keys)


class MeasurementUpdate(BaseModel):
    dimensions: dict[str, Decimal] = Field(default_factory=dict)
    dimension_expressions: dict[str, str] | None = None
    chainage: str | None = Field(default=None, max_length=100)
    rate: Decimal | None = Field(default=None, ge=0)
    boq_template_id: uuid.UUID | None = None
    steel_lines: list[SteelLineCreate] = Field(default_factory=list)

    _validate_dimension_expressions = field_validator("dimension_expressions")(_validate_dimension_expression_keys)


class MeasurementNotesUpdate(BaseModel):
    """Lightweight, standalone update — deliberately separate from
    MeasurementUpdate, which does a full replace of dimensions/steel_lines
    and would reject the request entirely if those were omitted."""
    notes: str | None = Field(default=None, max_length=1000)


class MeasurementRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    boq_item_id: uuid.UUID
    work_type_id: uuid.UUID
    measurement_date: date
    dimensions: dict[str, Decimal]
    dimension_expressions: dict[str, str] | None = None
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
    notes: str | None = None
    edited_by: uuid.UUID | None = None
    edited_by_name: str | None = None
    edited_at: datetime | None = None
    steel_lines: list[SteelLineRead] = []
    auto_materials: list[AutoMaterialRead] = []
