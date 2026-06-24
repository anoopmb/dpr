import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class WorkerCreate(BaseModel):
    project_id: uuid.UUID
    worker_category_id: uuid.UUID
    full_name: str = Field(min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=20)
    photo_url: str | None = Field(default=None, max_length=500)
    contractor_name: str | None = Field(default=None, max_length=255)
    # When true, the worker is auto-marked present for today as part of
    # being added — only honored if the project does not require photo/GPS
    # verification; otherwise the service rejects it and a full check-in
    # must be done separately.
    mark_present_today: bool = False


class WorkerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    worker_category_id: uuid.UUID
    full_name: str
    phone: str | None
    photo_url: str | None
    contractor_name: str | None
    is_active: bool


class WorkerUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    phone: str | None = Field(default=None, max_length=20)
    contractor_name: str | None = Field(default=None, max_length=255)
    worker_category_id: uuid.UUID | None = None
    is_active: bool | None = None


class AttendanceCheckInCreate(BaseModel):
    worker_id: uuid.UUID
    project_id: uuid.UUID
    latitude: Decimal | None = Field(default=None, ge=-90, le=90)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180)
    gps_accuracy_meters: Decimal | None = Field(default=None, ge=0)
    location_name: str | None = Field(default=None, max_length=500)
    photo_url: str | None = Field(default=None, min_length=1, max_length=500)


class MarkPresentRequest(BaseModel):
    """Bulk, no-verification attendance marking — only allowed on projects
    where neither attendance_photo_required nor attendance_gps_required is set."""

    project_id: uuid.UUID
    worker_ids: list[uuid.UUID] = Field(min_length=1)
    latitude: Decimal | None = Field(default=None, ge=-90, le=90)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180)
    gps_accuracy_meters: Decimal | None = Field(default=None, ge=0)
    location_name: str | None = Field(default=None, max_length=500)


class AttendanceRecordRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    worker_id: uuid.UUID
    attendance_date: date
    check_in_time: datetime
    photo_url: str | None
    latitude: Decimal | None
    longitude: Decimal | None
    gps_accuracy_meters: Decimal | None
    location_name: str | None
    within_geofence: bool
    marked_by: uuid.UUID
