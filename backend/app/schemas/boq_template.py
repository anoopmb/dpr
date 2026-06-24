import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class BoqTemplateItemCreate(BaseModel):
    section_no: str | None = Field(default=None, max_length=10)
    section_name: str | None = Field(default=None, max_length=200)
    item_no: str = Field(min_length=1, max_length=50)
    description: str = Field(min_length=1, max_length=500)
    work_type_id: uuid.UUID
    uom_id: uuid.UUID
    tendered_qty: Decimal = Field(gt=0)
    rate: Decimal = Field(ge=0)


class BoqTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=500)
    items: list[BoqTemplateItemCreate] = Field(min_length=1)


class BoqTemplateSaveFromProject(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=500)


class BoqTemplateItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    section_no: str | None
    section_name: str | None
    item_no: str
    description: str
    work_type_id: uuid.UUID
    uom_id: uuid.UUID
    tendered_qty: Decimal
    rate: Decimal


class BoqTemplateSummary(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    item_count: int


class BoqTemplateRead(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    items: list[BoqTemplateItemRead]


class BoqBulkImportRequest(BaseModel):
    items: list[BoqTemplateItemCreate] = Field(min_length=1)


class BoqBulkImportResult(BaseModel):
    added_sections: int
    added_items: int
    skipped_items: int
