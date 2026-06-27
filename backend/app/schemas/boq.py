import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class BoqItemBase(BaseModel):
    work_type_id: uuid.UUID
    uom_id: uuid.UUID
    item_no: str = Field(min_length=1, max_length=50)
    description: str = Field(min_length=1, max_length=500)
    tendered_qty: Decimal = Field(gt=0)
    rate: Decimal = Field(ge=0)


class BoqItemCreate(BoqItemBase):
    project_id: uuid.UUID
    section_id: uuid.UUID | None = None
    construction_type: str = "GENERAL"


class BoqItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    section_id: uuid.UUID | None
    work_type_id: uuid.UUID
    uom_id: uuid.UUID
    item_no: str
    description: str
    tendered_qty: Decimal
    rate: Decimal
    current_rate: Decimal
    current_tendered_qty: Decimal
    consumed_qty: Decimal
    has_active_variation_order: bool
    construction_type: str = "GENERAL"
    revision_count: int = 0

    @property
    def remaining_qty(self) -> Decimal:
        return self.current_tendered_qty - self.consumed_qty


class BoqItemUpdate(BaseModel):
    section_id: uuid.UUID | None = None
    item_no: str | None = Field(default=None, min_length=1, max_length=50)
    description: str | None = Field(default=None, min_length=1, max_length=500)
    work_type_id: uuid.UUID | None = None
    uom_id: uuid.UUID | None = None
    construction_type: str | None = Field(default=None, pattern="^(GENERAL|CONCRETE|STEEL|PRIME_COAT|TACK_COAT|BM|DBM|BC)$")


class BoqSectionCreate(BaseModel):
    project_id: uuid.UUID
    section_no: str = Field(min_length=1, max_length=10)
    section_name: str = Field(min_length=1, max_length=200)
    sort_order: int = Field(ge=0, default=0)


class BoqSectionUpdate(BaseModel):
    section_no: str | None = Field(default=None, min_length=1, max_length=10)
    section_name: str | None = Field(default=None, min_length=1, max_length=200)
    sort_order: int | None = Field(default=None, ge=0)


class BoqSectionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    section_no: str
    section_name: str
    sort_order: int
    items: list[BoqItemRead] = []
