"""Business-rule validators for measurements.

Operates on plain snapshot objects, not ORM models, so it is unit-testable
without a database. Services call these before committing a transaction.
"""

from dataclasses import dataclass
from decimal import Decimal

from app.core.exceptions import DomainError


class MeasurementValidationError(DomainError):
    error_code = "MB_EXCEEDS_TOLERANCE"


@dataclass(frozen=True)
class BoqItemSnapshot:
    tendered_qty: Decimal
    consumed_qty: Decimal
    has_active_variation_order: bool


DEFAULT_TOLERANCE_PCT = Decimal("10")


def validate_measurement_against_boq(
    measurement_qty: Decimal,
    boq_item: BoqItemSnapshot,
    tolerance_pct: Decimal = DEFAULT_TOLERANCE_PCT,
) -> None:
    if measurement_qty <= 0:
        raise MeasurementValidationError("Measured quantity must be greater than zero.")

    consumed = boq_item.consumed_qty + measurement_qty
    limit = boq_item.tendered_qty * (1 + tolerance_pct / 100)

    if consumed > limit and not boq_item.has_active_variation_order:
        raise MeasurementValidationError(
            f"Quantity {consumed} exceeds tendered {boq_item.tendered_qty} "
            f"by more than {tolerance_pct}% with no active Variation Order.",
            field_errors={"quantity": "exceeds_boq_tolerance"},
        )
