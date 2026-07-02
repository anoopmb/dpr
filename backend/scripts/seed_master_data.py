"""One-off script to populate Tier-1 master/lookup tables with the
reference data described in docs/DATABASE_SCHEMA.md, so the frontend has
real values to populate dropdowns with.

Usage: python -m scripts.seed_master_data
"""

import asyncio

from app.core.db import AsyncSessionLocal
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
from app.repositories.base import BaseRepository

DEPARTMENTS = [
    ("PWD", "Public Works Department"),
    ("IRRIGATION", "Irrigation Department"),
    ("WATER_AUTHORITY", "Water Authority"),
    ("MUNICIPALITY", "Municipality"),
    ("SMART_CITY", "Smart City Mission"),
]

UOMS = [
    ("M3", "Cubic Meter"),
    ("M2", "Square Meter"),
    ("RM", "Running Meter"),
    ("KG", "Kilogram"),
    ("BAG", "Bag"),
    ("TON", "Ton"),
    ("NOS", "Numbers"),
]

WORKER_CATEGORIES = [
    ("MASON", "Mason"),
    ("HELPER", "Helper"),
    ("CARPENTER", "Carpenter"),
    ("BAR_BENDER", "Bar Bender"),
]

EXPENSE_CATEGORIES = [
    ("LABOUR", "Labour"),
    ("MACHINERY", "Machinery"),
    ("MATERIAL", "Material"),
    ("FUEL", "Fuel"),
    ("TRANSPORT", "Transport"),
    ("FOOD", "Food"),
    ("ACCOMMODATION", "Accommodation"),
    ("MISC", "Miscellaneous"),
]

MACHINERY = [
    ("JCB", "JCB"),
    ("ROLLER", "Road Roller"),
    ("EXCAVATOR", "Excavator"),
]


async def main() -> None:
    async with AsyncSessionLocal() as session:
        dept_repo = BaseRepository(session, model=Department)
        existing = await dept_repo.list(limit=1)
        if existing:
            print("Master data already seeded — skipping.")
            return

        for code, name in DEPARTMENTS:
            dept_repo.add(Department(code=code, name=name))

        uom_repo = BaseRepository(session, model=UomMaster)
        uom_by_code = {}
        for code, name in UOMS:
            uom = UomMaster(code=code, name=name)
            uom_repo.add(uom)
            uom_by_code[code] = uom

        # Flush so UOM rows have ids assigned before other rows reference them via FK.
        await session.flush()

        worker_cat_repo = BaseRepository(session, model=WorkerCategoryMaster)
        for code, name in WORKER_CATEGORIES:
            worker_cat_repo.add(WorkerCategoryMaster(code=code, name=name))

        expense_cat_repo = BaseRepository(session, model=ExpenseCategoryMaster)
        for code, name in EXPENSE_CATEGORIES:
            expense_cat_repo.add(ExpenseCategoryMaster(code=code, name=name))

        machinery_repo = BaseRepository(session, model=MachineryMaster)
        for code, name in MACHINERY:
            machinery_repo.add(MachineryMaster(code=code, name=name))

        material_repo = BaseRepository(session, model=MaterialMaster)
        materials = [
            ("CEMENT_OPC", "Cement OPC", "BAG", "Cement"),
            ("TMT_12MM", "TMT 12mm", "TON", "Steel"),
            ("SAND", "Sand", "TON", "Aggregate"),
            ("TILES_600", "Tiles 600x600", "NOS", "Finishing"),
        ]
        for code, name, uom_code, category in materials:
            material_repo.add(
                MaterialMaster(code=code, name=name, default_uom_id=uom_by_code[uom_code].id, category=category)
            )

        work_type_repo = BaseRepository(session, model=WorkTypeMaster)
        work_types = [
            ("EARTHWORK", "Earthwork Excavation", ["length", "width", "depth"], WorkTypeFormula.PRODUCT, "M3"),
            ("RCC", "RCC Concrete", ["length", "breadth", "depth"], WorkTypeFormula.PRODUCT, "M3"),
            ("ROAD", "Road Work", ["length", "width", "thickness"], WorkTypeFormula.PRODUCT, "M3"),
            ("BRICKWORK", "Brickwork", ["length", "breadth", "thickness"], WorkTypeFormula.PRODUCT, "M3"),
            ("PLASTERING", "Plastering", ["length", "depth"], WorkTypeFormula.AREA_LH, "M2"),
            ("PIPE_LAYING", "Pipe Laying", ["length", "diameter"], WorkTypeFormula.LENGTH_ONLY, "RM"),
        ]
        for code, name, dims, formula, uom_code in work_types:
            work_type_repo.add(
                WorkTypeMaster(
                    code=code, name=name, dimension_fields=dims, formula=formula, output_uom_id=uom_by_code[uom_code].id
                )
            )

        await session.commit()
        print("Seeded master data.")


if __name__ == "__main__":
    asyncio.run(main())
