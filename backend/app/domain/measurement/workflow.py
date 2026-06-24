"""Explicit approval state machine for measurement entries.

DRAFT -> SUBMITTED -> PM_APPROVED -> QS_APPROVED -> LOCKED

Modeled explicitly rather than mutating a free-form status string, so illegal
transitions (e.g. QS approving before PM) are rejected at the domain layer.
"""

from enum import StrEnum

from app.core.exceptions import InvalidStateTransitionError


class MeasurementStatus(StrEnum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    PM_APPROVED = "PM_APPROVED"
    QS_APPROVED = "QS_APPROVED"
    LOCKED = "LOCKED"
    REJECTED = "REJECTED"


_ALLOWED_TRANSITIONS: dict[MeasurementStatus, set[MeasurementStatus]] = {
    MeasurementStatus.DRAFT: {MeasurementStatus.SUBMITTED},
    MeasurementStatus.SUBMITTED: {MeasurementStatus.PM_APPROVED, MeasurementStatus.REJECTED},
    MeasurementStatus.PM_APPROVED: {MeasurementStatus.QS_APPROVED, MeasurementStatus.REJECTED},
    MeasurementStatus.QS_APPROVED: {MeasurementStatus.LOCKED},
    MeasurementStatus.LOCKED: set(),
    MeasurementStatus.REJECTED: {MeasurementStatus.DRAFT},
}


def transition(current: MeasurementStatus, target: MeasurementStatus) -> MeasurementStatus:
    if target not in _ALLOWED_TRANSITIONS[current]:
        raise InvalidStateTransitionError(
            f"Cannot move measurement from {current} to {target}."
        )
    return target
