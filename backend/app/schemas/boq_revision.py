import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

REVISION_TYPES = ("VARIATION_ORDER", "RATE_AMENDMENT", "RECAST_ESTIMATE", "QTY_REVISION")
REVISION_STATUSES = ("PENDING", "APPROVED", "REJECTED")


class BoqRevisionCreate(BaseModel):
    revision_type: str = Field(pattern="^(VARIATION_ORDER|RATE_AMENDMENT|RECAST_ESTIMATE|QTY_REVISION)$")
    effective_from: date
    revised_rate: Decimal | None = Field(default=None, ge=0)
    revised_tendered_qty: Decimal | None = Field(default=None, gt=0)
    reason: str = Field(min_length=1)

    @model_validator(mode="after")
    def at_least_one_change(self) -> "BoqRevisionCreate":
        if self.revised_rate is None and self.revised_tendered_qty is None:
            raise ValueError("At least one of revised_rate or revised_tendered_qty must be provided.")
        return self


class BoqRevisionReject(BaseModel):
    rejected_reason: str = Field(min_length=1)


class BoqRevisionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    boq_item_id: uuid.UUID
    revision_number: str
    revision_type: str
    status: str
    effective_from: date
    revised_rate: Decimal | None
    revised_tendered_qty: Decimal | None
    reason: str
    created_by_user_id: uuid.UUID
    approved_by_user_id: uuid.UUID | None
    approved_at: datetime | None
    rejected_reason: str | None
    created_at: datetime
