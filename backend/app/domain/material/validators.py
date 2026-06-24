"""Business rules for material indent fulfillment.

Operates on plain snapshot objects, not ORM models, so it is testable
without a database.
"""

from dataclasses import dataclass
from decimal import Decimal

from app.core.exceptions import DomainError
from app.models.stock_location import StockLocationType


class MaterialIndentValidationError(DomainError):
    error_code = "MATERIAL_INDENT_INVALID"


@dataclass(frozen=True)
class IndentItemSnapshot:
    requested_qty: Decimal
    issued_qty: Decimal
    received_qty: Decimal


def validate_source_location_matches_type(
    source_type: StockLocationType, location_type: StockLocationType
) -> None:
    if source_type != location_type:
        raise MaterialIndentValidationError(
            f"source_type {source_type} does not match selected location type {location_type}."
        )


def validate_issue(item: IndentItemSnapshot, additional_issue_qty: Decimal) -> None:
    if additional_issue_qty <= 0:
        raise MaterialIndentValidationError("Issued quantity must be greater than zero.")
    if item.issued_qty + additional_issue_qty > item.requested_qty:
        raise MaterialIndentValidationError(
            f"Issuing {additional_issue_qty} would exceed requested quantity "
            f"{item.requested_qty} (already issued {item.issued_qty})."
        )


def validate_receipt(item: IndentItemSnapshot, additional_receipt_qty: Decimal) -> None:
    if additional_receipt_qty <= 0:
        raise MaterialIndentValidationError("Received quantity must be greater than zero.")
    if item.received_qty + additional_receipt_qty > item.issued_qty:
        raise MaterialIndentValidationError(
            f"Receiving {additional_receipt_qty} would exceed issued quantity "
            f"{item.issued_qty} (already received {item.received_qty})."
        )
