import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.organization_settings import DateFormat


class OrganizationSettingsUpdate(BaseModel):
    company_name: str | None = Field(default=None, min_length=1, max_length=255)
    company_logo_url: str | None = Field(default=None, max_length=500)
    company_address: str | None = Field(default=None, max_length=500)
    gst_number: str | None = Field(default=None, max_length=20)
    currency_code: str | None = Field(default=None, min_length=3, max_length=3)
    currency_symbol: str | None = Field(default=None, min_length=1, max_length=5)
    date_format: DateFormat | None = None
    decimal_places: int | None = Field(default=None, ge=0, le=4)
    use_thousands_separator: bool | None = None
    fiscal_year_start_month: int | None = Field(default=None, ge=1, le=12)
    default_measurement_tolerance_percent: Decimal | None = Field(default=None, ge=0, le=100)
    email_notifications_enabled: bool | None = None


class OrganizationSettingsRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_name: str
    company_logo_url: str | None
    company_address: str | None
    gst_number: str | None
    currency_code: str
    currency_symbol: str
    date_format: DateFormat
    decimal_places: int
    use_thousands_separator: bool
    fiscal_year_start_month: int
    default_measurement_tolerance_percent: Decimal
    email_notifications_enabled: bool
