import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Index, Numeric, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TimestampedBase

if TYPE_CHECKING:
    from app.models.master_data import MaterialMaster, UomMaster


class BoqConstructionTemplate(TimestampedBase):
    __tablename__ = "boq_construction_templates"
    __table_args__ = (
        Index(
            'uq_template_no_subtype',
            'construction_type', 'material_id',
            unique=True,
            postgresql_where=text('construction_subtype IS NULL'),
        ),
        Index(
            'uq_template_with_subtype',
            'construction_type', 'construction_subtype', 'material_id',
            unique=True,
            postgresql_where=text('construction_subtype IS NOT NULL'),
        ),
    )

    construction_type: Mapped[str] = mapped_column(String(20), nullable=False)
    construction_subtype: Mapped[str | None] = mapped_column(String(20), nullable=True)
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
