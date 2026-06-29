import uuid
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Index, Integer, Numeric, String, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import TimestampedBase

if TYPE_CHECKING:
    from app.models.master_data import MaterialMaster, UomMaster


class BoqConstructionTemplate(TimestampedBase):
    __tablename__ = "boq_construction_templates"
    __table_args__ = (
        Index(
            'uq_template_name_no_subtype',
            'construction_type', 'name',
            unique=True,
            postgresql_where=text('construction_subtype IS NULL'),
        ),
        Index(
            'uq_template_name_with_subtype',
            'construction_type', 'construction_subtype', 'name',
            unique=True,
            postgresql_where=text('construction_subtype IS NOT NULL'),
        ),
    )

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    construction_type: Mapped[str] = mapped_column(String(20), nullable=False)
    construction_subtype: Mapped[str | None] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    items: Mapped[list["BoqConstructionTemplateItem"]] = relationship(
        "BoqConstructionTemplateItem",
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="BoqConstructionTemplateItem.sort_order",
        lazy="selectin",
    )


class BoqConstructionTemplateItem(TimestampedBase):
    __tablename__ = "boq_construction_template_items"
    __table_args__ = (
        Index('ix_template_items_template_id', 'template_id'),
    )

    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("boq_construction_templates.id", ondelete="CASCADE"),
        nullable=False,
    )
    material_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("material_master.id", ondelete="RESTRICT"),
        nullable=False,
    )
    coefficient: Mapped[Decimal] = mapped_column(Numeric(14, 6), nullable=False)
    rate: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    uom_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("uom_master.id", ondelete="RESTRICT"),
        nullable=False,
    )
    notes: Mapped[str | None] = mapped_column(String(100), nullable=True)
    bar_diameter_mm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    template: Mapped["BoqConstructionTemplate"] = relationship(
        "BoqConstructionTemplate", back_populates="items"
    )
    material: Mapped["MaterialMaster"] = relationship("MaterialMaster", lazy="joined")
    uom: Mapped["UomMaster"] = relationship("UomMaster", lazy="joined")
