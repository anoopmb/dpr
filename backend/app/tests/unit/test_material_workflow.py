from decimal import Decimal

import pytest

from app.core.exceptions import InvalidStateTransitionError
from app.domain.material.validators import (
    IndentItemSnapshot,
    MaterialIndentValidationError,
    validate_issue,
    validate_receipt,
    validate_source_location_matches_type,
)
from app.domain.material.workflow import MaterialIndentStatus, transition
from app.models.stock_location import StockLocationType


def test_workflow_draft_to_submitted_allowed():
    assert transition(MaterialIndentStatus.DRAFT, MaterialIndentStatus.SUBMITTED) == MaterialIndentStatus.SUBMITTED


def test_workflow_cannot_skip_to_received():
    with pytest.raises(InvalidStateTransitionError):
        transition(MaterialIndentStatus.DRAFT, MaterialIndentStatus.RECEIVED)


def test_workflow_received_is_terminal():
    with pytest.raises(InvalidStateTransitionError):
        transition(MaterialIndentStatus.RECEIVED, MaterialIndentStatus.ISSUED)


def test_source_location_type_mismatch_raises():
    with pytest.raises(MaterialIndentValidationError):
        validate_source_location_matches_type(StockLocationType.HEAD_OFFICE, StockLocationType.SITE)


def test_source_location_type_match_passes():
    validate_source_location_matches_type(StockLocationType.SITE, StockLocationType.SITE)


def test_issue_cannot_exceed_requested_qty():
    item = IndentItemSnapshot(
        requested_qty=Decimal("100"), issued_qty=Decimal("80"), received_qty=Decimal("0")
    )
    with pytest.raises(MaterialIndentValidationError):
        validate_issue(item, Decimal("30"))


def test_issue_within_requested_qty_passes():
    item = IndentItemSnapshot(
        requested_qty=Decimal("100"), issued_qty=Decimal("80"), received_qty=Decimal("0")
    )
    validate_issue(item, Decimal("20"))


def test_receipt_cannot_exceed_issued_qty():
    item = IndentItemSnapshot(
        requested_qty=Decimal("100"), issued_qty=Decimal("50"), received_qty=Decimal("40")
    )
    with pytest.raises(MaterialIndentValidationError):
        validate_receipt(item, Decimal("20"))


def test_receipt_within_issued_qty_passes():
    item = IndentItemSnapshot(
        requested_qty=Decimal("100"), issued_qty=Decimal("50"), received_qty=Decimal("40")
    )
    validate_receipt(item, Decimal("10"))
