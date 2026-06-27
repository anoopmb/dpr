"""Add material codes needed by the BOQ construction-type template feature.

New codes added (idempotent — skips existing codes):
  UOMs  : MT (Metric Ton)
  Aggs  : CEMENT, AGG_10MM, AGG_20MM, AGG_40MM
  Steel : STEEL_10MM … STEEL_32MM (KG), STEEL_10MM_MT … STEEL_32MM_MT (MT)

Usage: python -m scripts.seed_material_template_codes
"""

import asyncio

from sqlalchemy import select

from app.core.db import AsyncSessionLocal
from app.models.master_data import MaterialMaster, UomMaster

NEW_UOMS = [
    ("MT", "Metric Ton"),
]

NEW_MATERIALS: list[tuple[str, str, str, str]] = [
    # (code, name, uom_code, category)
    ("CEMENT",        "Cement (Generic)",         "BAG", "Cement"),
    ("AGG_10MM",      "Aggregate 10mm",            "M3",  "Aggregate"),
    ("AGG_20MM",      "Aggregate 20mm",            "M3",  "Aggregate"),
    ("AGG_40MM",      "Aggregate 40mm",            "M3",  "Aggregate"),
    ("STEEL_10MM",    "Steel TMT 10mm",            "KG",  "Steel"),
    ("STEEL_12MM",    "Steel TMT 12mm",            "KG",  "Steel"),
    ("STEEL_16MM",    "Steel TMT 16mm",            "KG",  "Steel"),
    ("STEEL_20MM",    "Steel TMT 20mm",            "KG",  "Steel"),
    ("STEEL_25MM",    "Steel TMT 25mm",            "KG",  "Steel"),
    ("STEEL_32MM",    "Steel TMT 32mm",            "KG",  "Steel"),
    ("STEEL_10MM_MT", "Steel TMT 10mm (MT)",       "MT",  "Steel"),
    ("STEEL_12MM_MT", "Steel TMT 12mm (MT)",       "MT",  "Steel"),
    ("STEEL_16MM_MT", "Steel TMT 16mm (MT)",       "MT",  "Steel"),
    ("STEEL_20MM_MT", "Steel TMT 20mm (MT)",       "MT",  "Steel"),
    ("STEEL_25MM_MT", "Steel TMT 25mm (MT)",       "MT",  "Steel"),
    ("STEEL_32MM_MT", "Steel TMT 32mm (MT)",       "MT",  "Steel"),
]


async def main() -> None:
    async with AsyncSessionLocal() as session:
        existing_uom_codes = {
            row.code
            for row in (await session.execute(select(UomMaster))).scalars().all()
        }
        uom_by_code: dict[str, UomMaster] = {
            row.code: row
            for row in (await session.execute(select(UomMaster))).scalars().all()
        }

        added_uoms = 0
        for code, name in NEW_UOMS:
            if code not in existing_uom_codes:
                uom = UomMaster(code=code, name=name, decimal_places=3)
                session.add(uom)
                uom_by_code[code] = uom
                added_uoms += 1
                print(f"  + UOM {code}")

        await session.flush()

        existing_mat_codes = {
            row.code
            for row in (await session.execute(select(MaterialMaster))).scalars().all()
        }

        added_mats = 0
        for code, name, uom_code, category in NEW_MATERIALS:
            if code in existing_mat_codes:
                continue
            uom = uom_by_code.get(uom_code)
            if uom is None:
                print(f"  ! Skipping {code}: UOM '{uom_code}' not found.")
                continue
            session.add(MaterialMaster(
                code=code,
                name=name,
                default_uom_id=uom.id,
                category=category,
            ))
            added_mats += 1
            print(f"  + Material {code}")

        await session.commit()
        print(f"Done — added {added_uoms} UOM(s), {added_mats} material(s).")


if __name__ == "__main__":
    asyncio.run(main())
