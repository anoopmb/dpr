import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class BoqConstructionTemplateCreate(BaseModel):
    construction_type: str = Field(pattern="^(CONCRETE|STEEL|PRIME_COAT|TACK_COAT|BM|DBM|BC)$")
    construction_subtype: str | None = Field(default=None, max_length=20)
    material_id: uuid.UUID
    coefficient: Decimal = Field(gt=0)
    coefficient_description: str | None = Field(default=None, max_length=100)
    uom_id: uuid.UUID
    is_active: bool = True


class BoqConstructionTemplateUpdate(BaseModel):
    coefficient: Decimal | None = Field(default=None, gt=0)
    coefficient_description: str | None = None
    uom_id: uuid.UUID | None = None
    is_active: bool | None = None


class BoqConstructionTemplateRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    construction_type: str
    construction_subtype: str | None
    material_id: uuid.UUID
    material_name: str = ""
    material_code: str = ""
    coefficient: Decimal
    coefficient_description: str | None
    uom_id: uuid.UUID
    uom_code: str = ""
    is_active: bool
    created_at: datetime

    @classmethod
    def from_orm_with_joins(cls, obj: object) -> "BoqConstructionTemplateRead":
        return cls(
            id=obj.id,
            construction_type=obj.construction_type,
            construction_subtype=obj.construction_subtype,
            material_id=obj.material_id,
            material_name=obj.material.name if obj.material else "",
            material_code=obj.material.code if obj.material else "",
            coefficient=obj.coefficient,
            coefficient_description=obj.coefficient_description,
            uom_id=obj.uom_id,
            uom_code=obj.uom.code if obj.uom else "",
            is_active=obj.is_active,
            created_at=obj.created_at,
        )
