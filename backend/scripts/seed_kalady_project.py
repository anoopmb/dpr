"""One-off script to load the Kalady-Malayattoor CRF road + drainage
project exactly as documented in UPGRADE_PLAN.md: 3 BOQ sections, the full
48-line BOQ item list (the plan's own "32 items" summary undercounts the
itemized tables — 12 Road + 16 Drainage + 20 Traffic Safety = 48), 24
materials with cost rates, 27 machinery types with hire rates, 5 labour
categories with daily rates, and the two expense categories (PURCHASE,
OTHER_DEPT) observed in the source data but missing from the generic seed.

Idempotent: skips entirely if a project with this tender_no already exists.

Usage: python -m scripts.seed_kalady_project
"""

import asyncio
from datetime import date
from decimal import Decimal

from sqlalchemy import select

from app.core.db import AsyncSessionLocal
from app.models.boq import BoqItem, BoqSection
from app.models.department import Department
from app.models.master_data import (
    ExpenseCategoryMaster,
    MachineryMaster,
    MaterialMaster,
    UomMaster,
    WorkerCategoryMaster,
    WorkTypeFormula,
    WorkTypeMaster,
)
from app.models.project import Project

TENDER_NO = "KLY-MLY-2023-001"

# code -> (name,)
UOMS = {
    "CUM": "Cubic Meter",
    "SQM": "Square Meter",
    "HEC": "Hectare",
    "HR": "Hour",
    "LTR": "Litre",
    "CFT": "Cubic Feet",
    "BARREL": "Barrel",
}

# code -> (name, dimension_fields, formula, output_uom_code)
WORK_TYPES = {
    "GEN_VOLUME": ("Generic Volume (L x W x D)", ["count", "length", "width", "depth"], WorkTypeFormula.PRODUCT, "CUM"),
    "GEN_AREA": ("Generic Area (L x W)", ["count", "length", "width"], WorkTypeFormula.PRODUCT, "SQM"),
    "GEN_LENGTH": ("Generic Running Length", ["count", "length"], WorkTypeFormula.LENGTH_ONLY, "RM"),
    "GEN_COUNT": ("Generic Count", ["count"], WorkTypeFormula.LENGTH_ONLY, "NOS"),
    "GEN_WEIGHT": ("Generic Weight", ["weight"], WorkTypeFormula.LENGTH_ONLY, "TON"),
    "GEN_HOURS": ("Generic Hours", ["hours"], WorkTypeFormula.LENGTH_ONLY, "HR"),
    "GEN_HECTARE": ("Generic Hectare", ["area"], WorkTypeFormula.LENGTH_ONLY, "HEC"),
}

# (section_no, section_name, [(item_no, description, uom_code, work_type_code, rate, qty), ...])
SECTIONS = [
    (
        "1",
        "ROAD WORKS",
        [
            ("1.001", "Removal of earth", "CUM", "GEN_VOLUME", "50", "554.25"),
            ("1.002", "Scarifying", "SQM", "GEN_AREA", "6", "26765"),
            ("1.003", "Excavation", "CUM", "GEN_VOLUME", "50", "308"),
            ("1.004", "GSB", "CUM", "GEN_VOLUME", "3000", "176"),
            ("1.005", "WMM", "CUM", "GEN_VOLUME", "3000", "2808.5"),
            ("1.006", "Primer coat", "SQM", "GEN_AREA", "65", "24950"),
            ("1.007", "Tack coat", "SQM", "GEN_AREA", "15", "187300"),
            ("1.008", "BM (Bituminous Macadam)", "CUM", "GEN_VOLUME", "9000", "5509.188"),
            ("1.009", "BC (Bituminous Concrete)", "CUM", "GEN_VOLUME", "13000", "2778.75"),
            ("1.010", "BC SP", "CUM", "GEN_VOLUME", "13000", "405"),
            ("1.011", "Interlock Tile", "SQM", "GEN_AREA", "1300", "3395"),
            ("1.012", "Construction of Embankment", "CUM", "GEN_VOLUME", "100", "182.6"),
        ],
    ),
    (
        "2",
        "DRAINAGE WORKS",
        [
            ("2.001", "Clearing grass", "HEC", "GEN_HECTARE", "50000", "4.2"),
            ("2.002", "Dismantling", "CUM", "GEN_VOLUME", "700", "192.05"),
            ("2.003", "Earthwork", "CUM", "GEN_VOLUME", "75", "5659.168"),
            ("2.004", "Earthwork - Irish drain", "CUM", "GEN_VOLUME", "50", "950"),
            ("2.005", "PCC M15 Bed", "CUM", "GEN_VOLUME", "7200", "2589.67"),
            ("2.006", "PCC M20", "CUM", "GEN_VOLUME", "7700", "550.19"),
            ("2.007", "RCC M20 Raft", "CUM", "GEN_VOLUME", "7750", "2695.75"),
            ("2.008", "RCC M25", "CUM", "GEN_VOLUME", "8500", "101.92"),
            ("2.009", "HYSD bar", "TON", "GEN_WEIGHT", "85000", "170.918"),
            ("2.010", "Man Mazdoor", "NOS", "GEN_COUNT", "1000", "100"),
            ("2.011", "Removal of earth from hill side", "RM", "GEN_LENGTH", "100", "2000"),
            ("2.012", "Removal of waste earth", "HR", "GEN_HOURS", "1400", "110"),
            ("2.013", "DR Masonry", "CUM", "GEN_VOLUME", "4000", "448.125"),
            ("2.014", "Filling with contractors own earth", "CUM", "GEN_VOLUME", "350", "537.5"),
            ("2.015", "Cover slabs", "CUM", "GEN_VOLUME", "2600", "423.75"),
            ("2.016", "Back filling", "CUM", "GEN_VOLUME", "2500", "86.76"),
        ],
    ),
    (
        "3",
        "TRAFFIC SAFETY APPURTENANCES",
        [
            ("3.001", "90 cm Equilateral Board", "NOS", "GEN_COUNT", "4500", "30"),
            ("3.002", "60 cm circular", "NOS", "GEN_COUNT", "4300", "20"),
            ("3.003", "80 x 60 mm rectangular", "NOS", "GEN_COUNT", "5000", "15"),
            ("3.004", "60 x 45 cm rectangular", "NOS", "GEN_COUNT", "4000", "15"),
            ("3.005", "90 cm high octagon", "NOS", "GEN_COUNT", "6000", "20"),
            ("3.006", "50 x 60 cm rectangular single chevron", "NOS", "GEN_COUNT", "4000", "20"),
            ("3.007", "Direction & place identification board area <=0.9", "SQM", "GEN_AREA", "9000", "43.2"),
            ("3.008", "Direction & place identification board area >0.9", "SQM", "GEN_AREA", "9500", "24.3"),
            ("3.009", "Thermoplastic compound", "SQM", "GEN_AREA", "500", "6295.95"),
            ("3.010", "Delineator", "NOS", "GEN_COUNT", "750", "1500"),
            ("3.011", "M15 grade boundary pillars", "NOS", "GEN_COUNT", "1200", "50"),
            ("3.012", "Crash barrier thrie-beam", "RM", "GEN_LENGTH", "4500", "1745"),
            ("3.013", "Road studs", "NOS", "GEN_COUNT", "250", "12241"),
            ("3.014", "Bitumen drum delineator", "NOS", "GEN_COUNT", "800", "200"),
            ("3.015", "OHM", "NOS", "GEN_COUNT", "3000", "50"),
            ("3.016", "Ceramic tiles", "NOS", "GEN_COUNT", "150", "350"),
            ("3.017", "Median marker", "NOS", "GEN_COUNT", "500", "70"),
            ("3.018", "Construction of cement concrete kerb", "RM", "GEN_LENGTH", "500", "64.8"),
            ("3.019", "Construction of median & island", "CUM", "GEN_VOLUME", "500", "9.312"),
            ("3.020", "Painting (kerb)", "SQM", "GEN_AREA", "200", "27.864"),
        ],
    ),
]

# code, name, default_uom_code, category, cost_rate, cost_rate_unit
MATERIALS = [
    ("CEMENT", "Cement", "BAG", "Cement", "350", "bag"),
    ("AGG_40MM", "40mm aggregate", "CUM", "Aggregate", "2224.782", "Cum"),
    ("AGG_20MM", "20mm aggregate", "CUM", "Aggregate", "2224.782", "Cum"),
    ("AGG_12MM", "12mm aggregate", "CUM", "Aggregate", "2224.782", "Cum"),
    ("AGG_6MM", "6mm aggregate", "CUM", "Aggregate", "2224.782", "Cum"),
    ("SAND", "Sand", "CUM", "Aggregate", "3600", "Cum"),
    ("DUST", "Dust", "CUM", "Aggregate", "2260.096", "Cum"),
    ("DR_STONE", "DR (stone/debris)", "CUM", "Aggregate", "1271.304", "Cum"),
    ("BOULDER", "Boulder", "CUM", "Aggregate", "1271.304", "Cum"),
    ("STEEL_25MM", "Steel 25mm dia", "KG", "Steel", "70", "Kg"),
    ("STEEL_20MM", "Steel 20mm dia", "KG", "Steel", "70", "Kg"),
    ("STEEL_16MM", "Steel 16mm dia", "KG", "Steel", "70", "Kg"),
    ("STEEL_12MM", "Steel 12mm dia", "KG", "Steel", "70", "Kg"),
    ("STEEL_10MM", "Steel 10mm dia", "KG", "Steel", "70", "Kg"),
    ("STEEL_8MM", "Steel 8mm dia", "KG", "Steel", "70", "Kg"),
    ("DIESEL", "Diesel", "LTR", "Fuel", "97", "Ltr"),
    ("GSB_MAT", "GSB", "CFT", "Road Material", "59", "Cft"),
    ("WMM_MAT", "WMM", "CFT", "Road Material", "59", "Cft"),
    ("VG30", "VG-30 (bitumen)", "KG", "Bitumen", "46.6", "Kg"),
    ("VG40", "VG-40 (bitumen)", "KG", "Bitumen", "48.58", "Kg"),
    ("NRMB", "NRMB", "KG", "Bitumen", "57.1", "Kg"),
    ("SS_PRIME_COAT", "SS-Prime Coat", "BARREL", "Bitumen", "17700.52", "Barrel"),
    ("RS_TACK_COAT", "RS-Tack Coat", "BARREL", "Bitumen", "9810.24", "Barrel"),
    ("LDO", "LDO", "LTR", "Fuel", "70.28", "Ltr"),
]

# code, name, hire_rate (None if variable/unknown), hire_unit
MACHINERY = [
    ("TIPPER_600CFT", "TIPPER 600cft", "10800", "Daily"),
    ("TIPPER_MEDIUM", "Tipper (medium)", "9600", "Daily"),
    ("TIPPER_SMALL", "Tipper (small)", "7000", "Daily"),
    ("TIPPER_RENT", "Tipper (rent)", None, "Daily"),  # source gives a 4000-8000 range, not a fixed rate
    ("MAZDA", "Mazda", "5000", "Daily"),
    ("NISSAN", "Nissan", "4500", "Daily"),
    ("AJAX_MIXER_4M3", "Ajax mixer 4 m3", "15000", "Daily"),
    ("AJAX_MIXER_2M3", "Ajax mixer 2 m3", "10000", "Daily"),
    ("PAVER_SENSOR", "Paver (Sensor)", "20000", "Daily"),
    ("PAVER_MANUAL", "Paver (Manual)", "15000", "Daily"),
    ("ROLLER_VIBRATORY", "Roller (Vibratory)", "15000", "Daily"),
    ("ROLLER_MANUAL", "Roller (Manual)", "8000", "Daily"),
    ("ROLLER_RENT", "Roller (rent)", "6500", "Daily"),
    ("GRADER", "Grader", "12000", "Daily"),
    ("JCB_TEREX", "JCB/Terex", "1050", "Hr"),
    ("JCB_RENT_1", "JCB (rent variant 1)", "1200", "Hr"),
    ("JCB_RENT_2", "JCB (rent variant 2)", "1100", "Hr"),
    ("VOLVO_EXCAVATOR", "Volvo Excavator", "2000", "Hr"),
    ("HITACHI", "Hitachi", "2500", "Hr"),
    ("COMPRESSOR", "Compressor", "6000", "Daily"),
    ("PICKUP", "Pickup", "3000", "Daily"),
    ("BOBCAT", "Bobcat", "1300", "Hr"),
    ("TANKER", "Tanker", "5000", "Daily"),
    ("MIXER_MACHINE", "Mixer machine", None, "Daily"),  # no rate given in source sheet
    ("TORUS_825FT", "Torus (825 ft)", "6000", "Daily"),
    ("TORUS_575FT", "Torus (575 ft)", "5400", "Daily"),
    ("TORUS_300FT", "Torus (300 ft)", "4800", "Daily"),
]

# code, name, daily_rate
LABOUR_CATEGORIES = [
    ("SANDEEP_LABOUR", "Sandeep Labour (sub-contractor)", "850"),
    ("MASON", "Mason", "1000"),
    ("HELPER", "Helper", "700"),
    ("SITE_SUPERVISOR", "Supervisor/Site Engineer", "1000"),
    ("SUBCONTRACTOR_LABOUR", "Sub contractor labour", "850"),
]

EXPENSE_CATEGORIES = [
    ("PURCHASE", "Purchase"),
    ("OTHER_DEPT", "Other Department"),
]


async def main() -> None:
    async with AsyncSessionLocal() as session:
        existing = await session.execute(select(Project).where(Project.tender_no == TENDER_NO))
        if existing.scalar_one_or_none() is not None:
            print(f"Project with tender_no={TENDER_NO} already exists - skipping.")
            return

        uom_result = await session.execute(select(UomMaster))
        uom_by_code = {u.code: u for u in uom_result.scalars().all()}
        for code, name in UOMS.items():
            if code not in uom_by_code:
                uom = UomMaster(code=code, name=name)
                session.add(uom)
                uom_by_code[code] = uom
        await session.flush()

        work_type_result = await session.execute(select(WorkTypeMaster))
        work_type_by_code = {w.code: w for w in work_type_result.scalars().all()}
        for code, (name, dims, formula, output_uom_code) in WORK_TYPES.items():
            if code not in work_type_by_code:
                wt = WorkTypeMaster(
                    code=code,
                    name=name,
                    dimension_fields=dims,
                    formula=formula,
                    output_uom_id=uom_by_code[output_uom_code].id,
                )
                session.add(wt)
                work_type_by_code[code] = wt
        await session.flush()

        dept_result = await session.execute(select(Department).where(Department.code == "PWD"))
        department = dept_result.scalar_one_or_none()
        if department is None:
            department = Department(code="PWD", name="Public Works Department")
            session.add(department)
            await session.flush()

        contract_value = Decimal("0")
        for _, _, items in SECTIONS:
            for _, _, _, _, rate, qty in items:
                contract_value += Decimal(rate) * Decimal(qty)
        contract_value = contract_value.quantize(Decimal("0.01"))

        project = Project(
            department_id=department.id,
            name="Kalady-Malayattoor Road & Drainage Improvement (CRF)",
            tender_no=TENDER_NO,
            agreement_no=None,
            contract_value=contract_value,
            start_date=date(2023, 9, 21),
            completion_date=date(2024, 7, 31),
            site_latitude=Decimal("10.183400"),
            site_longitude=Decimal("76.405100"),
        )
        session.add(project)
        await session.flush()

        for sort_order, (section_no, section_name, items) in enumerate(SECTIONS, start=1):
            section = BoqSection(
                project_id=project.id,
                section_no=section_no,
                section_name=section_name,
                sort_order=sort_order,
            )
            session.add(section)
            await session.flush()

            for item_no, description, uom_code, work_type_code, rate, qty in items:
                session.add(
                    BoqItem(
                        project_id=project.id,
                        section_id=section.id,
                        work_type_id=work_type_by_code[work_type_code].id,
                        uom_id=uom_by_code[uom_code].id,
                        item_no=item_no,
                        description=description,
                        tendered_qty=Decimal(qty),
                        rate=Decimal(rate),
                    )
                )

        material_result = await session.execute(select(MaterialMaster))
        existing_material_codes = {m.code for m in material_result.scalars().all()}
        for code, name, uom_code, category, cost_rate, cost_rate_unit in MATERIALS:
            if code not in existing_material_codes:
                session.add(
                    MaterialMaster(
                        code=code,
                        name=name,
                        default_uom_id=uom_by_code[uom_code].id,
                        category=category,
                        cost_rate=Decimal(cost_rate),
                        cost_rate_unit=cost_rate_unit,
                    )
                )

        machinery_result = await session.execute(select(MachineryMaster))
        existing_machinery_codes = {m.code for m in machinery_result.scalars().all()}
        for code, name, hire_rate, hire_unit in MACHINERY:
            if code not in existing_machinery_codes:
                session.add(
                    MachineryMaster(
                        code=code,
                        name=name,
                        hire_rate=Decimal(hire_rate) if hire_rate is not None else None,
                        hire_unit=hire_unit,
                    )
                )

        worker_cat_result = await session.execute(select(WorkerCategoryMaster))
        existing_worker_cats = {w.code: w for w in worker_cat_result.scalars().all()}
        for code, name, daily_rate in LABOUR_CATEGORIES:
            if code in existing_worker_cats:
                existing_worker_cats[code].daily_rate = Decimal(daily_rate)
            else:
                session.add(WorkerCategoryMaster(code=code, name=name, daily_rate=Decimal(daily_rate)))

        expense_cat_result = await session.execute(select(ExpenseCategoryMaster))
        existing_expense_codes = {e.code for e in expense_cat_result.scalars().all()}
        for code, name in EXPENSE_CATEGORIES:
            if code not in existing_expense_codes:
                session.add(ExpenseCategoryMaster(code=code, name=name))

        await session.commit()
        item_count = sum(len(items) for _, _, items in SECTIONS)
        print(f"Seeded project '{project.name}' (tender_no={TENDER_NO}, contract_value={contract_value}).")
        print(f"  {len(SECTIONS)} BOQ sections, {item_count} BOQ items.")
        print(f"  {len(MATERIALS)} materials, {len(MACHINERY)} machinery, {len(LABOUR_CATEGORIES)} labour categories.")


if __name__ == "__main__":
    asyncio.run(main())
