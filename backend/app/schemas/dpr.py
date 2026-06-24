import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.dpr import DprStatus, IssueSeverity, IssueStatus


class DprHeaderCreate(BaseModel):
    project_id: uuid.UUID
    report_date: date
    weather: str | None = Field(default=None, max_length=100)
    daily_work_summary: str | None = Field(default=None, max_length=500)
    supervisor_name: str | None = Field(default=None, max_length=200)
    no_work: bool = False
    no_work_reason: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def _require_reason_when_no_work(self) -> "DprHeaderCreate":
        if self.no_work and not self.no_work_reason:
            raise ValueError("no_work_reason is required when no_work is true.")
        return self


class DprHeaderUpdate(BaseModel):
    weather: str | None = Field(default=None, max_length=100)
    daily_work_summary: str | None = Field(default=None, max_length=500)
    supervisor_name: str | None = Field(default=None, max_length=200)
    no_work: bool | None = None
    no_work_reason: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def _require_reason_when_no_work(self) -> "DprHeaderUpdate":
        if self.no_work is True and not self.no_work_reason:
            raise ValueError("no_work_reason is required when no_work is true.")
        return self


class DprWorkItemCreate(BaseModel):
    boq_item_id: uuid.UUID
    qty_today: Decimal = Field(gt=0)
    notes: str | None = Field(default=None, max_length=500)


class DprWorkItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    boq_item_id: uuid.UUID
    qty_today: Decimal
    notes: str | None


class DprIssueCreate(BaseModel):
    description: str = Field(min_length=1, max_length=1000)
    severity: IssueSeverity
    owner_user_id: uuid.UUID | None = None
    photo_url: str | None = Field(default=None, max_length=500)


class DprIssueRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    description: str
    severity: IssueSeverity
    owner_user_id: uuid.UUID | None
    status: IssueStatus
    photo_url: str | None


class DprMaterialCreate(BaseModel):
    material_id: uuid.UUID
    qty_consumed: Decimal = Field(gt=0)
    uom_id: uuid.UUID


class DprMaterialRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    material_id: uuid.UUID
    qty_consumed: Decimal
    uom_id: uuid.UUID


class DprMachineryCreate(BaseModel):
    machinery_id: uuid.UUID
    hours_used: Decimal = Field(gt=0, le=24)


class DprMachineryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    machinery_id: uuid.UUID
    hours_used: Decimal


class DprHeaderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    report_date: date
    weather: str | None
    daily_work_summary: str | None
    supervisor_name: str | None
    no_work: bool
    no_work_reason: str | None
    submitted_by: uuid.UUID
    submitted_at: datetime | None
    status: DprStatus
    work_items: list[DprWorkItemRead]
    issues: list[DprIssueRead]
    materials: list[DprMaterialRead]
    machinery_entries: list[DprMachineryRead]


class DprProductionEntryUpsert(BaseModel):
    boq_item_id: uuid.UUID
    qty_today: Decimal
    chainage: str | None = Field(default=None, max_length=100)
    remarks: str | None = Field(default=None, max_length=500)


class DprProductionBulkUpsert(BaseModel):
    daily_work_summary: str | None = Field(default=None, max_length=500)
    entries: list[DprProductionEntryUpsert]


class DprProductionEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    dpr_header_id: uuid.UUID
    boq_item_id: uuid.UUID
    qty_today: Decimal
    amount_today: Decimal
    chainage: str | None
    remarks: str | None


class BoqItemProgressRead(BaseModel):
    boq_item_id: uuid.UUID
    section_id: uuid.UUID | None
    section_no: str | None
    section_name: str | None
    item_no: str
    description: str
    unit: str
    rate: Decimal
    agreed_qty: Decimal
    executed_qty: Decimal
    executed_amount: Decimal
    remaining_qty: Decimal
    percent_complete: Decimal | None


class SectionProgressRead(BaseModel):
    section_id: uuid.UUID | None
    section_no: str | None
    section_name: str
    items: list[BoqItemProgressRead]
    section_agreed_amount: Decimal
    section_executed_amount: Decimal


class ProductionProgressRead(BaseModel):
    as_of_date: date
    sections: list[SectionProgressRead]
    total_agreed_amount: Decimal
    total_executed_amount: Decimal
