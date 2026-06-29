import uuid
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.boq_construction_template import BoqConstructionTemplate, BoqConstructionTemplateItem

BITUMINOUS_TYPES = {"PRIME_COAT", "TACK_COAT", "BM", "DBM", "BC"}


@dataclass
class MaterialTemplateResult:
    material_id: uuid.UUID
    material_code: str
    material_name: str
    computed_qty: Decimal
    uom_id: uuid.UUID
    uom_code: str
    rate: Decimal | None


class MaterialTemplateService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_templates_for_type(
        self,
        construction_type: str,
        construction_subtype: str | None = None,
        active_only: bool = True,
    ) -> list[BoqConstructionTemplate]:
        stmt = sa_select(BoqConstructionTemplate).where(
            BoqConstructionTemplate.construction_type == construction_type,
        )
        if active_only:
            stmt = stmt.where(BoqConstructionTemplate.is_active.is_(True))
        if construction_subtype is not None:
            stmt = stmt.where(BoqConstructionTemplate.construction_subtype == construction_subtype)
        rows = await self.session.execute(stmt)
        return list(rows.scalars().all())

    async def get_template(self, template_id: uuid.UUID) -> BoqConstructionTemplate | None:
        return await self.session.get(BoqConstructionTemplate, template_id)

    @staticmethod
    def line_weight(bar_count: Decimal, length_m: Decimal, coefficient: Decimal) -> Decimal:
        return (bar_count * length_m * coefficient).quantize(Decimal("0.000001"))

    async def compute_materials(
        self,
        template_id: uuid.UUID,
        qty: Decimal,
        steel_lines: list | None = None,
        steel_uom: str = "MT",
    ) -> list[MaterialTemplateResult]:
        template = await self.get_template(template_id)
        if template is None or not template.is_active or not template.items:
            return []

        if template.construction_type == "STEEL":
            return self._compute_steel(template, steel_lines or [], steel_uom)
        return self._compute_standard(template, qty)

    def _compute_standard(
        self, template: BoqConstructionTemplate, qty: Decimal
    ) -> list[MaterialTemplateResult]:
        results = []
        for item in template.items:
            computed_qty = (qty * item.coefficient).quantize(Decimal("0.001"))
            if computed_qty <= 0:
                continue
            results.append(MaterialTemplateResult(
                material_id=item.material_id,
                material_code=item.material.code if item.material else "",
                material_name=item.material.name if item.material else "",
                computed_qty=computed_qty,
                uom_id=item.uom_id,
                uom_code=item.uom.code if item.uom else "",
                rate=item.rate if item.rate is not None else (
                    item.material.cost_rate if item.material else None
                ),
            ))
        return results

    def _compute_steel(
        self, template: BoqConstructionTemplate, steel_lines: list, steel_uom: str
    ) -> list[MaterialTemplateResult]:
        dia_map: dict[int, BoqConstructionTemplateItem] = {
            item.bar_diameter_mm: item
            for item in template.items
            if item.bar_diameter_mm is not None
        }
        by_dia: dict[int, Decimal] = {}
        for line in steel_lines:
            item = dia_map.get(int(line.diameter_mm))
            if item is None:
                continue
            w = self.line_weight(
                Decimal(str(line.bar_count)),
                Decimal(str(line.length_m)),
                item.coefficient,
            )
            by_dia[line.diameter_mm] = by_dia.get(line.diameter_mm, Decimal(0)) + w

        results = []
        for dia, weight_mt in by_dia.items():
            item = dia_map.get(dia)
            if item is None:
                continue
            if steel_uom == "KG":
                computed_qty = (weight_mt * 1000).quantize(Decimal("0.001"))
            else:
                computed_qty = weight_mt.quantize(Decimal("0.000001"))
            if computed_qty <= 0:
                continue
            results.append(MaterialTemplateResult(
                material_id=item.material_id,
                material_code=item.material.code if item.material else "",
                material_name=item.material.name if item.material else "",
                computed_qty=computed_qty,
                uom_id=item.uom_id,
                uom_code=item.uom.code if item.uom else "",
                rate=item.rate if item.rate is not None else (
                    item.material.cost_rate if item.material else None
                ),
            ))
        return results

    def build_steel_coeff_map(
        self, template: BoqConstructionTemplate
    ) -> dict[int, BoqConstructionTemplateItem]:
        return {
            item.bar_diameter_mm: item
            for item in template.items
            if item.bar_diameter_mm is not None
        }
