from decimal import Decimal

import pytest

from app.domain.measurement.calculators import calculate_quantity
from app.domain.measurement.validators import (
    BoqItemSnapshot,
    MeasurementValidationError,
    validate_measurement_against_boq,
)
from app.domain.measurement.workflow import DRAFT, SUBMITTED, WorkflowLevel, transition
from app.core.exceptions import InvalidStateTransitionError
from app.models.master_data import WorkTypeFormula


def test_calculate_quantity_earthwork():
    qty = calculate_quantity(
        WorkTypeFormula.PRODUCT,
        ["length", "width", "depth"],
        {"length": Decimal("100"), "width": Decimal("2"), "depth": Decimal("1.5")},
    )
    assert qty == Decimal("300.0")


def test_calculate_quantity_plastering_area():
    qty = calculate_quantity(
        WorkTypeFormula.AREA_LH,
        ["length", "height"],
        {"length": Decimal("10"), "height": Decimal("3")},
    )
    assert qty == Decimal("30")


def test_calculate_quantity_pipe_laying_length_only():
    qty = calculate_quantity(
        WorkTypeFormula.LENGTH_ONLY,
        ["length", "diameter"],
        {"length": Decimal("50"), "diameter": Decimal("150")},
    )
    assert qty == Decimal("50")


def test_calculate_quantity_missing_dimension_raises():
    with pytest.raises(ValueError, match="Missing dimensions"):
        calculate_quantity(WorkTypeFormula.PRODUCT, ["length", "width"], {"length": Decimal("1")})


def test_validate_measurement_within_tolerance_passes():
    snapshot = BoqItemSnapshot(
        tendered_qty=Decimal("1000"), consumed_qty=Decimal("900"), has_active_variation_order=False
    )
    validate_measurement_against_boq(Decimal("50"), snapshot)  # should not raise


def test_validate_measurement_exceeding_tolerance_raises():
    snapshot = BoqItemSnapshot(
        tendered_qty=Decimal("1000"), consumed_qty=Decimal("950"), has_active_variation_order=False
    )
    with pytest.raises(MeasurementValidationError):
        validate_measurement_against_boq(Decimal("200"), snapshot)


def test_validate_measurement_exceeding_tolerance_allowed_with_variation_order():
    snapshot = BoqItemSnapshot(
        tendered_qty=Decimal("1000"), consumed_qty=Decimal("950"), has_active_variation_order=True
    )
    validate_measurement_against_boq(Decimal("200"), snapshot)  # should not raise


_DEFAULT_LEVELS = [
    WorkflowLevel(status_code="PM_APPROVED", allow_reject=True),
    WorkflowLevel(status_code="QS_APPROVED", allow_reject=True),
]


def test_workflow_rejects_illegal_transition():
    with pytest.raises(InvalidStateTransitionError):
        transition(DRAFT, "QS_APPROVED", _DEFAULT_LEVELS)


def test_workflow_allows_sequential_transition():
    assert transition(DRAFT, SUBMITTED, _DEFAULT_LEVELS) == SUBMITTED
    assert transition(SUBMITTED, "PM_APPROVED", _DEFAULT_LEVELS) == "PM_APPROVED"
    assert transition("PM_APPROVED", "QS_APPROVED", _DEFAULT_LEVELS) == "QS_APPROVED"


def test_workflow_allows_reject_from_any_level():
    assert transition(SUBMITTED, "REJECTED", _DEFAULT_LEVELS) == "REJECTED"
    assert transition("PM_APPROVED", "REJECTED", _DEFAULT_LEVELS) == "REJECTED"
    assert transition("REJECTED", DRAFT, _DEFAULT_LEVELS) == DRAFT


def test_workflow_no_transition_past_final_level():
    with pytest.raises(InvalidStateTransitionError):
        transition("QS_APPROVED", "LOCKED", _DEFAULT_LEVELS)
