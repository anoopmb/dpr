import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.master_data import MachineryHireUnit, WorkTypeFormula
from app.models.stock_location import StockLocationType


class DepartmentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    code: str = Field(min_length=1, max_length=20)


class DepartmentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    code: str | None = Field(default=None, min_length=1, max_length=20)


class DepartmentRead(DepartmentCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    is_active: bool


class UomCreate(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    name: str = Field(min_length=1, max_length=100)
    decimal_places: int = Field(default=3, ge=0, le=4)


class UomUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=20)
    name: str | None = Field(default=None, min_length=1, max_length=100)
    decimal_places: int | None = Field(default=None, ge=0, le=4)


class UomRead(UomCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class WorkTypeCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    dimension_fields: list[str] = Field(min_length=1, max_length=4)
    formula: WorkTypeFormula
    output_uom_id: uuid.UUID


class WorkTypeUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=50)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    dimension_fields: list[str] | None = Field(default=None, min_length=1, max_length=4)
    formula: WorkTypeFormula | None = None
    output_uom_id: uuid.UUID | None = None


class WorkTypeRead(WorkTypeCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    is_active: bool


class MaterialCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    default_uom_id: uuid.UUID
    category: str | None = Field(default=None, max_length=100)
    cost_rate: Decimal | None = None
    cost_rate_unit: str | None = Field(default=None, max_length=50)


class MaterialUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=50)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    default_uom_id: uuid.UUID | None = None
    category: str | None = Field(default=None, max_length=100)
    cost_rate: Decimal | None = None
    cost_rate_unit: str | None = Field(default=None, max_length=50)


class MaterialRead(MaterialCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    is_active: bool


class MachineryCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    hire_unit: MachineryHireUnit = MachineryHireUnit.HOUR
    hire_rate: Decimal | None = Field(default=None, ge=0)


class MachineryUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=50)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    hire_unit: MachineryHireUnit | None = None
    hire_rate: Decimal | None = None


class MachineryRead(MachineryCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    is_active: bool


class WorkerCategoryCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=100)
    daily_rate: Decimal | None = None


class WorkerCategoryUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=50)
    name: str | None = Field(default=None, min_length=1, max_length=100)
    daily_rate: Decimal | None = None


class WorkerCategoryRead(WorkerCategoryCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class ExpenseCategoryCreate(BaseModel):
    code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=100)


class ExpenseCategoryUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=50)
    name: str | None = Field(default=None, min_length=1, max_length=100)


class ExpenseCategoryRead(ExpenseCategoryCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID


class StockLocationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    location_type: StockLocationType
    project_id: uuid.UUID | None = None


class StockLocationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    location_type: StockLocationType | None = None
    project_id: uuid.UUID | None = None


class StockLocationRead(StockLocationCreate):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    is_active: bool
