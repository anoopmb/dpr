import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

VALID_CONSTRUCTION_TYPES = "^(CONCRETE|STEEL|PRIME_COAT|TACK_COAT|BM|DBM|BC)$"


# ── Template Item Schemas ─────────────────────────────────────────────────────

class BoqConstructionTemplateItemCreate(BaseModel):
    material_id: uuid.UUID
    coefficient: Decimal = Field(gt=0)
    rate: Decimal | None = Field(default=None, ge=0)
    uom_id: uuid.UUID
    notes: str | None = Field(default=None, max_length=100)
    bar_diameter_mm: int | None = Field(default=None, ge=6, le=50)
    sort_order: int = Field(default=0, ge=0)


class BoqConstructionTemplateItemUpdate(BaseModel):
    coefficient: Decimal | None = Field(default=None, gt=0)
    rate: Decimal | None = Field(default=None, ge=0)
    uom_id: uuid.UUID | None = None
    notes: str | None = None
    bar_diameter_mm: int | None = None
    sort_order: int | None = Field(default=None, ge=0)


class BoqConstructionTemplateItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    template_id: uuid.UUID
    material_id: uuid.UUID
    material_name: str = ""
    material_code: str = ""
    coefficient: Decimal
    rate: Decimal | None
    uom_id: uuid.UUID
    uom_code: str = ""
    notes: str | None
    bar_diameter_mm: int | None
    sort_order: int

    @classmethod
    def from_orm(cls, obj: object) -> "BoqConstructionTemplateItemRead":
        return cls(
            id=obj.id,
            template_id=obj.template_id,
            material_id=obj.material_id,
            material_name=obj.material.name if obj.material else "",
            material_code=obj.material.code if obj.material else "",
            coefficient=obj.coefficient,
            rate=obj.rate,
            uom_id=obj.uom_id,
            uom_code=obj.uom.code if obj.uom else "",
            notes=obj.notes,
            bar_diameter_mm=obj.bar_diameter_mm,
            sort_order=obj.sort_order,
        )


# ── Template Header Schemas ───────────────────────────────────────────────────

class BoqConstructionTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=500)
    construction_type: str = Field(pattern=VALID_CONSTRUCTION_TYPES)
    construction_subtype: str | None = Field(default=None, max_length=20)
    is_active: bool = True


class BoqConstructionTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    is_active: bool | None = None


class BoqConstructionTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    construction_type: str
    construction_subtype: str | None
    is_active: bool
    items: list[BoqConstructionTemplateItemRead] = []
    created_at: datetime

    @classmethod
    def from_orm(cls, obj: object) -> "BoqConstructionTemplateRead":
        return cls(
            id=obj.id,
            name=obj.name,
            description=obj.description,
            construction_type=obj.construction_type,
            construction_subtype=obj.construction_subtype,
            is_active=obj.is_active,
            items=[BoqConstructionTemplateItemRead.from_orm(i) for i in (obj.items or [])],
            created_at=obj.created_at,
        )
