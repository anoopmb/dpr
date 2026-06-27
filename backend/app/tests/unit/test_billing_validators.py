from decimal import Decimal

import pytest

from app.domain.billing.validators import (
    BillingValidationError,
    validate_measurement_billable,
    validate_payment_within_bill_total,
)


def test_unbilled_measurement_passes():
    validate_measurement_billable("DRAFT", billed=False)


def test_already_billed_measurement_raises():
    with pytest.raises(BillingValidationError):
        validate_measurement_billable("DRAFT", billed=True)


def test_payment_within_remaining_balance_passes():
    validate_payment_within_bill_total(Decimal("500"), Decimal("400"), Decimal("1000"))


def test_payment_exceeding_remaining_balance_raises():
    with pytest.raises(BillingValidationError):
        validate_payment_within_bill_total(Decimal("700"), Decimal("400"), Decimal("1000"))
