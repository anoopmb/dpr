"""Quantity-calculation formulas, driven by work_type_master configuration.

No FastAPI/SQLAlchemy imports here — kept testable with plain values. The
admin-configurable Measurement Sheet Designer (work_type_master.formula +
dimension_fields) is the single source of truth for which dimensions a work
type needs and how its quantity is computed — this module has no hardcoded
per-work-type list, so adding a new work type is a master-data row, not a
code change.
"""

from decimal import Decimal

from app.models.master_data import WorkTypeFormula


def calculate_quantity(
    formula: WorkTypeFormula, dimension_fields: list[str], dimensions: dict[str, Decimal]
) -> Decimal:
    """Computes quantity from raw dimensions per the work type's formula.

    dimension_fields gives the field order (and which fields are required);
    dimensions must supply a value for each one.
    """
    missing = [field for field in dimension_fields if field not in dimensions]
    if missing:
        raise ValueError(f"Missing dimensions: {missing}")

    values = [dimensions[field] for field in dimension_fields]

    if formula == WorkTypeFormula.PRODUCT:
        result = Decimal(1)
        for value in values:
            result *= value
        return result

    if formula == WorkTypeFormula.AREA_LH:
        length, height = values[0], values[1]
        return length * height

    if formula == WorkTypeFormula.LENGTH_ONLY:
        return values[0]

    raise ValueError(f"Unsupported formula: {formula}")
