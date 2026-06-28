import uuid
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.boq_construction_template import BoqConstructionTemplate
from app.models.master_data import UomMaster

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

    async def get_templates(
        self, construction_type: str, construction_subtype: str | None = None
    ) -> list[BoqConstructionTemplate]:
        stmt = sa_select(BoqConstructionTemplate).where(
            BoqConstructionTemplate.construction_type == construction_type,
            BoqConstructionTemplate.is_active.is_(True),
        )
        if construction_subtype is not None:
            stmt = stmt.where(BoqConstructionTemplate.construction_subtype == construction_subtype)
        else:
            stmt = stmt.where(BoqConstructionTemplate.construction_subtype.is_(None))
        rows = await self.session.execute(stmt)
        return list(rows.scalars().all())

    async def get_steel_coeff_map(self) -> dict[int, BoqConstructionTemplate]:
        """Returns {diameter_mm: template} for all active STEEL templates."""
        templates = await self.get_templates("STEEL")
        return {int(t.construction_subtype): t for t in templates if t.construction_subtype}

    @staticmethod
    def line_weight(bar_count: Decimal, length_m: Decimal, coefficient: Decimal) -> Decimal:
        return (bar_count * length_m * coefficient).quantize(Decimal("0.000001"))

    async def compute_concrete_materials(
        self, grade: str, volume_cum: Decimal
    ) -> list[MaterialTemplateResult]:
        templates = await self.get_templates("CONCRETE", construction_subtype=grade)
        results = []
        for t in templates:
            qty = (volume_cum * t.coefficient).quantize(Decimal("0.001"))
            if qty <= 0:
                continue
            uom = await self.session.get(UomMaster, t.uom_id)
            results.append(MaterialTemplateResult(
                material_id=t.material_id,
                material_code=t.material.code,
                material_name=t.material.name,
                computed_qty=qty,
                uom_id=t.uom_id,
                uom_code=uom.code if uom else "",
                rate=t.rate if t.rate is not None else t.material.cost_rate,
            ))
        return results

    async def compute_steel_materials(
        self, steel_lines: list, steel_uom: str = "MT"
    ) -> list[MaterialTemplateResult]:
        coeff_map = await self.get_steel_coeff_map()
        by_dia: dict[int, Decimal] = {}
        for line in steel_lines:
            t = coeff_map.get(int(line.diameter_mm))
            if t is None:
                continue
            w = self.line_weight(
                Decimal(str(line.bar_count)),
                Decimal(str(line.length_m)),
                t.coefficient,
            )
            by_dia[line.diameter_mm] = by_dia.get(line.diameter_mm, Decimal(0)) + w
        results = []
        for dia, weight_mt in by_dia.items():
            t = coeff_map.get(dia)
            if t is None:
                continue
            if steel_uom == "KG":
                qty = (weight_mt * 1000).quantize(Decimal("0.001"))
            else:
                qty = weight_mt.quantize(Decimal("0.000001"))
            if qty <= 0:
                continue
            uom = await self.session.get(UomMaster, t.uom_id)
            results.append(MaterialTemplateResult(
                material_id=t.material_id,
                material_code=t.material.code,
                material_name=t.material.name,
                computed_qty=qty,
                uom_id=t.uom_id,
                uom_code=uom.code if uom else "",
                rate=t.rate if t.rate is not None else t.material.cost_rate,
            ))
        return results

    async def compute_bituminous_materials(
        self, construction_type: str, boq_qty: Decimal
    ) -> list[MaterialTemplateResult]:
        templates = await self.get_templates(construction_type)
        results = []
        for t in templates:
            qty = (boq_qty * t.coefficient).quantize(Decimal("0.001"))
            if qty <= 0:
                continue
            uom = await self.session.get(UomMaster, t.uom_id)
            results.append(MaterialTemplateResult(
                material_id=t.material_id,
                material_code=t.material.code,
                material_name=t.material.name,
                computed_qty=qty,
                uom_id=t.uom_id,
                uom_code=uom.code if uom else "",
                rate=t.rate if t.rate is not None else t.material.cost_rate,
            ))
        return results
