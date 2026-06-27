import uuid
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import DomainError
from app.models.boq_construction_template import BoqConstructionTemplate
from app.models.master_data import MaterialMaster, UomMaster

STEEL_COEFFICIENTS: dict[int, Decimal] = {
    10: Decimal("0.000617"),
    12: Decimal("0.000888"),
    16: Decimal("0.001580"),
    20: Decimal("0.002460"),
    25: Decimal("0.003850"),
    32: Decimal("0.006320"),
}

CONCRETE_COEFFICIENTS: dict[str, dict[str, Decimal]] = {
    "M10": {"CEMENT": Decimal("4.5"),  "SAND": Decimal("0.456"), "AGG_20MM": Decimal("0.912"), "AGG_40MM": Decimal("0.430")},
    "M15": {"CEMENT": Decimal("6.3"),  "SAND": Decimal("0.430"), "AGG_20MM": Decimal("0.430"), "AGG_40MM": Decimal("0.430")},
    "M20": {"CEMENT": Decimal("8.0"),  "SAND": Decimal("0.415"), "AGG_20MM": Decimal("0.829")},
    "M25": {"CEMENT": Decimal("11.0"), "SAND": Decimal("0.380"), "AGG_10MM": Decimal("0.090"), "AGG_20MM": Decimal("0.760")},
    "M30": {"CEMENT": Decimal("13.6"), "SAND": Decimal("0.350"), "AGG_10MM": Decimal("0.090"), "AGG_20MM": Decimal("0.270")},
    "M35": {"CEMENT": Decimal("8.44"), "SAND": Decimal("0.450"), "AGG_10MM": Decimal("0.360"), "AGG_20MM": Decimal("0.540"), "AGG_40MM": Decimal("0.540")},
    "M40": {"CEMENT": Decimal("8.60"), "SAND": Decimal("0.450"), "AGG_10MM": Decimal("0.360"), "AGG_20MM": Decimal("0.540"), "AGG_40MM": Decimal("0.540")},
}

SUPPORTED_CONCRETE_GRADES = list(CONCRETE_COEFFICIENTS.keys())
SUPPORTED_STEEL_DIAMETERS = sorted(STEEL_COEFFICIENTS.keys())
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

    def compute_steel_line_weight(self, diameter_mm: int, bar_count: Decimal, length_m: Decimal) -> Decimal:
        coeff = STEEL_COEFFICIENTS.get(diameter_mm)
        if coeff is None:
            raise DomainError(f"Unsupported steel diameter: {diameter_mm}mm. Supported: {SUPPORTED_STEEL_DIAMETERS}")
        return (bar_count * length_m * coeff).quantize(Decimal("0.000001"))

    async def compute_concrete_materials(
        self, grade: str, volume_cum: Decimal
    ) -> list[MaterialTemplateResult]:
        coeffs = CONCRETE_COEFFICIENTS.get(grade)
        if coeffs is None:
            raise DomainError(f"Unsupported concrete grade: {grade}. Supported: {SUPPORTED_CONCRETE_GRADES}")
        results = []
        for mat_code, coeff in coeffs.items():
            mat = await self._get_material_by_code(mat_code)
            uom = await self.session.get(UomMaster, mat.default_uom_id)
            qty = (volume_cum * coeff).quantize(Decimal("0.001"))
            if qty <= 0:
                continue
            results.append(MaterialTemplateResult(
                material_id=mat.id,
                material_code=mat.code,
                material_name=mat.name,
                computed_qty=qty,
                uom_id=mat.default_uom_id,
                uom_code=uom.code if uom else "",
                rate=mat.cost_rate,
            ))
        return results

    async def compute_steel_materials(
        self, steel_lines: list, steel_uom: str = "MT"
    ) -> list[MaterialTemplateResult]:
        by_dia: dict[int, Decimal] = {}
        for line in steel_lines:
            w = self.compute_steel_line_weight(
                line.diameter_mm,
                Decimal(str(line.bar_count)),
                Decimal(str(line.length_m)),
            )
            by_dia[line.diameter_mm] = by_dia.get(line.diameter_mm, Decimal(0)) + w
        results = []
        for dia, weight_mt in by_dia.items():
            if steel_uom == "KG":
                mat_code = f"STEEL_{dia}MM"
                qty = (weight_mt * 1000).quantize(Decimal("0.001"))
            else:
                mat_code = f"STEEL_{dia}MM_MT"
                qty = weight_mt.quantize(Decimal("0.000001"))
            if qty <= 0:
                continue
            mat = await self._get_material_by_code(mat_code)
            uom = await self.session.get(UomMaster, mat.default_uom_id)
            results.append(MaterialTemplateResult(
                material_id=mat.id,
                material_code=mat.code,
                material_name=mat.name,
                computed_qty=qty,
                uom_id=mat.default_uom_id,
                uom_code=uom.code if uom else "",
                rate=mat.cost_rate,
            ))
        return results

    async def compute_bituminous_materials(
        self, construction_type: str, boq_qty: Decimal
    ) -> list[MaterialTemplateResult]:
        rows = await self.session.execute(
            sa_select(BoqConstructionTemplate).where(
                BoqConstructionTemplate.construction_type == construction_type,
                BoqConstructionTemplate.is_active.is_(True),
            )
        )
        templates = rows.scalars().all()
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
                rate=t.material.cost_rate,
            ))
        return results

    async def _get_material_by_code(self, code: str) -> MaterialMaster:
        row = await self.session.execute(
            sa_select(MaterialMaster).where(MaterialMaster.code == code)
        )
        mat = row.scalar_one_or_none()
        if mat is None:
            raise DomainError(f"Material code '{code}' not found in master. Ensure seed data is loaded.")
        return mat
