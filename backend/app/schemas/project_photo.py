import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.project_photo import PhotoEntityType


class ProjectPhotoCreate(BaseModel):
    entity_type: PhotoEntityType
    entity_id: uuid.UUID
    photo_url: str = Field(min_length=1, max_length=500)
    latitude: Decimal | None = Field(default=None, ge=-90, le=90)
    longitude: Decimal | None = Field(default=None, ge=-180, le=180)
    captured_at: datetime


class ProjectPhotoRead(ProjectPhotoCreate):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    uploaded_by: uuid.UUID
