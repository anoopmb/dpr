import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TimestampedBase

if TYPE_CHECKING:
    from app.models.master_data import MaterialMaster, UomMaster


class BoqConstructionTemplate(TimestampedBase):
    __tablename__ = "boq_construction_templates"
    __table_args__ = (
        UniqueConstraint("construction_type", "material_id", name="uq_construction_template"),
        CheckConstraint(
            "construction_type IN ('PRIME_COAT','TACK_COAT','BM','DBM','BC')",
            name="ck_bituminous_types_only",
        ),
    )

    construction_type: Mapped[str] = mapped_column(String(20), nullable=False)
    material_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("material_master.id", ondelete="RESTRICT"), nullable=False
    )
    coefficient: Mapped[Decimal] = mapped_column(Numeric(14, 6), nullable=False)
    coefficient_description: Mapped[str | None] = mapped_column(String(100), nullable=True)
    uom_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("uom_master.id", ondelete="RESTRICT"), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    material: Mapped["MaterialMaster"] = relationship("MaterialMaster", lazy="joined")
    uom: Mapped["UomMaster"] = relationship("UomMaster", lazy="joined")
