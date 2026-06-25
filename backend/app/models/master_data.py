"""Tier-1 lookup/master tables: units, work types, materials, machinery,
worker categories, expense categories. Small, slow-changing reference data
looked up by transactional tables via FK."""

import uuid
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import TimestampedBase


class UomMaster(TimestampedBase):
    __tablename__ = "uom_master"

    code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # Drives quantity display precision wherever this UOM is used (e.g. Nos=0, Cum/Sqm=3).
    decimal_places: Mapped[int] = mapped_column(Integer, nullable=False, default=3)


class WorkTypeFormula(StrEnum):
    PRODUCT = "PRODUCT"  # multiply all dimension fields
    AREA_LH = "AREA_LH"  # length * height only
    LENGTH_ONLY = "LENGTH_ONLY"  # billed by running length


class WorkTypeMaster(TimestampedBase):
    __tablename__ = "work_type_master"
    __table_args__ = (
        CheckConstraint(
            "jsonb_array_length(dimension_fields) BETWEEN 1 AND 4",
            name="ck_work_type_dimension_fields_length",
        ),
    )

    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    dimension_fields: Mapped[list[str]] = mapped_column(JSONB, nullable=False)
    formula: Mapped[WorkTypeFormula] = mapped_column(String(20), nullable=False)
    output_uom_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("uom_master.id", ondelete="RESTRICT"), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class MaterialMaster(TimestampedBase):
    __tablename__ = "material_master"

    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    default_uom_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("uom_master.id", ondelete="RESTRICT"), nullable=False
    )
    category: Mapped[str | None] = mapped_column(String(100))
    cost_rate: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    cost_rate_unit: Mapped[str | None] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class MachineryHireUnit(StrEnum):
    HOUR = "HOUR"
    HALF_DAY = "HALF_DAY"
    DAY = "DAY"
    WEEK = "WEEK"
    MONTH = "MONTH"
    YEAR = "YEAR"
    OWNED = "OWNED"


class MachineryMaster(TimestampedBase):
    __tablename__ = "machinery_master"

    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    hire_rate: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    hire_unit: Mapped[str] = mapped_column(String(20), nullable=False, server_default="HOUR")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class WorkerCategoryMaster(TimestampedBase):
    __tablename__ = "worker_category_master"

    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    daily_rate: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))


class ExpenseCategoryMaster(TimestampedBase):
    __tablename__ = "expense_category_master"

    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
