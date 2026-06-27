"""Billing business rules: any not-yet-billed measurement can be billed;
cumulative payments against a bill can never exceed its total."""

from decimal import Decimal

from app.core.exceptions import DomainError


class BillingValidationError(DomainError):
    error_code = "BILLING_VALIDATION_ERROR"


def validate_measurement_billable(measurement_status: str, billed: bool) -> None:
    if billed:
        raise BillingValidationError("This measurement has already been billed.")


def validate_payment_within_bill_total(
    amount_received: Decimal, already_received: Decimal, bill_total: Decimal
) -> None:
    if already_received + amount_received > bill_total:
        remaining = bill_total - already_received
        raise BillingValidationError(
            f"Payment {amount_received} exceeds the remaining balance ({remaining}) on this bill."
        )
