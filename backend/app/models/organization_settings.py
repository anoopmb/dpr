from decimal import Decimal
from enum import StrEnum

from sqlalchemy import Boolean, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class DateFormat(StrEnum):
    DMY = "DD/MM/YYYY"
    MDY = "MM/DD/YYYY"
    YMD = "YYYY-MM-DD"


class OrganizationSettings(TimestampedBase):
    """Singleton row — company branding + regional/financial formatting
    defaults applied across the app. Created lazily on first read."""

    __tablename__ = "organization_settings"

    company_name: Mapped[str] = mapped_column(String(255), nullable=False, default="My Company")

    # Branding images. Light/dark variants are picked by the frontend based on
    # the active theme; "small" variants are the compact mark shown in the
    # collapsed/mobile sidebar. favicon_url drives the browser tab icon —
    # applied at runtime via JS since it must also work on the pre-auth login
    # page where the SPA's static index.html favicon can't be templated.
    company_logo_light_url: Mapped[str | None] = mapped_column(String(500))
    company_logo_dark_url: Mapped[str | None] = mapped_column(String(500))
    company_logo_small_light_url: Mapped[str | None] = mapped_column(String(500))
    company_logo_small_dark_url: Mapped[str | None] = mapped_column(String(500))
    favicon_url: Mapped[str | None] = mapped_column(String(500))

    company_address: Mapped[str | None] = mapped_column(String(500))
    gst_number: Mapped[str | None] = mapped_column(String(20))

    currency_code: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    currency_symbol: Mapped[str] = mapped_column(String(5), nullable=False, default="₹")
    date_format: Mapped[DateFormat] = mapped_column(String(20), nullable=False, default=DateFormat.DMY)
    # IANA zone name (e.g. "Asia/Kolkata") — used both to format timestamps
    # for display app-wide and, server-side, to determine "today" for
    # attendance/DPR date logic instead of the server process's own local
    # clock (which may be a different calendar day than the org's local
    # time near midnight). Validated against zoneinfo.available_timezones()
    # in the Pydantic schema, not re-validated here.
    timezone: Mapped[str] = mapped_column(String(50), nullable=False, default="Asia/Kolkata")
    decimal_places: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    use_thousands_separator: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    fiscal_year_start_month: Mapped[int] = mapped_column(Integer, nullable=False, default=4)

    # Default BOQ-tolerance percentage for new measurements (domain default
    # can still be overridden per-call; this is the org-wide starting point).
    default_measurement_tolerance_percent: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("10")
    )

    # Org-wide switch for the optional email leg of the notification system.
    # Even when True, email only actually sends if SMTP settings are also
    # configured (see app.core.email) — this is the admin-facing on/off.
    email_notifications_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
