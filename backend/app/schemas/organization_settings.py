import uuid
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.organization_settings import DateFormat


class OrganizationSettingsUpdate(BaseModel):
    company_name: str | None = Field(default=None, min_length=1, max_length=255)
    company_logo_light_url: str | None = Field(default=None, max_length=500)
    company_logo_dark_url: str | None = Field(default=None, max_length=500)
    company_logo_small_light_url: str | None = Field(default=None, max_length=500)
    company_logo_small_dark_url: str | None = Field(default=None, max_length=500)
    favicon_url: str | None = Field(default=None, max_length=500)
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
    company_logo_light_url: str | None
    company_logo_dark_url: str | None
    company_logo_small_light_url: str | None
    company_logo_small_dark_url: str | None
    favicon_url: str | None
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


class OrganizationBrandingRead(BaseModel):
    """Public, unauthenticated subset of org settings — company name, logos,
    and favicon only. Needed because the login page and the browser-tab
    favicon must render before any session cookie exists, so they can't call
    the authenticated /settings/organization endpoint."""

    model_config = ConfigDict(from_attributes=True)

    company_name: str
    company_logo_light_url: str | None
    company_logo_dark_url: str | None
    company_logo_small_light_url: str | None
    company_logo_small_dark_url: str | None
    favicon_url: str | None
