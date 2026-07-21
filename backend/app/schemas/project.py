import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.project import ProjectStatus


class ProjectBase(BaseModel):
    department_id: uuid.UUID
    name: str = Field(min_length=1, max_length=255)
    tender_no: str = Field(min_length=1, max_length=100)
    agreement_no: str | None = Field(default=None, max_length=100)
    contract_value: Decimal = Field(gt=0)
    start_date: date
    completion_date: date
    site_engineer_id: uuid.UUID | None = None
    project_manager_id: uuid.UUID | None = None
    site_latitude: Decimal | None = Field(default=None, ge=-90, le=90)
    site_longitude: Decimal | None = Field(default=None, ge=-180, le=180)
    geofence_radius_meters: int = Field(default=500, gt=0)
    attendance_photo_required: bool = True
    attendance_gps_required: bool = True
    attendance_required_for_dpr: bool = False

    @model_validator(mode="after")
    def validate_dates(self) -> "ProjectBase":
        if self.completion_date <= self.start_date:
            raise ValueError("completion_date must be after start_date")
        return self


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    agreement_no: str | None = Field(default=None, max_length=100)
    contract_value: Decimal | None = Field(default=None, gt=0)
    completion_date: date | None = None
    status: ProjectStatus | None = None
    site_engineer_id: uuid.UUID | None = None
    project_manager_id: uuid.UUID | None = None
    attendance_photo_required: bool | None = None
    attendance_gps_required: bool | None = None
    attendance_required_for_dpr: bool | None = None
    site_latitude: Decimal | None = Field(default=None, ge=-90, le=90)
    site_longitude: Decimal | None = Field(default=None, ge=-180, le=180)
    geofence_radius_meters: int | None = Field(default=None, gt=0)


class ProjectRead(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: ProjectStatus


class CompletionExtensionCreate(BaseModel):
    new_completion_date: date
    reason: str | None = Field(default=None, max_length=500)


class CompletionExtensionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    previous_completion_date: date
    new_completion_date: date
    reason: str | None
    extended_by: uuid.UUID
    extended_by_name: str
    extended_at: datetime
