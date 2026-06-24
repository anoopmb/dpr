"""Material indent (internal stock request) state machine.

DRAFT -> SUBMITTED -> APPROVED -> ISSUED -> PARTIALLY_RECEIVED -> RECEIVED
                    -> REJECTED
            -> CANCELLED (from DRAFT/SUBMITTED only)

No procurement states here (no PO/vendor/invoice) — fulfillment is always
either the Head Office store or another site's surplus.
"""

from enum import StrEnum

from app.core.exceptions import InvalidStateTransitionError


class MaterialIndentStatus(StrEnum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    ISSUED = "ISSUED"
    PARTIALLY_RECEIVED = "PARTIALLY_RECEIVED"
    RECEIVED = "RECEIVED"
    CANCELLED = "CANCELLED"


_ALLOWED_TRANSITIONS: dict[MaterialIndentStatus, set[MaterialIndentStatus]] = {
    MaterialIndentStatus.DRAFT: {MaterialIndentStatus.SUBMITTED, MaterialIndentStatus.CANCELLED},
    MaterialIndentStatus.SUBMITTED: {
        MaterialIndentStatus.APPROVED,
        MaterialIndentStatus.REJECTED,
        MaterialIndentStatus.CANCELLED,
    },
    MaterialIndentStatus.APPROVED: {MaterialIndentStatus.ISSUED},
    MaterialIndentStatus.ISSUED: {
        MaterialIndentStatus.PARTIALLY_RECEIVED,
        MaterialIndentStatus.RECEIVED,
    },
    MaterialIndentStatus.PARTIALLY_RECEIVED: {MaterialIndentStatus.RECEIVED},
    MaterialIndentStatus.RECEIVED: set(),
    MaterialIndentStatus.REJECTED: set(),
    MaterialIndentStatus.CANCELLED: set(),
}


def transition(current: MaterialIndentStatus, target: MaterialIndentStatus) -> MaterialIndentStatus:
    if target not in _ALLOWED_TRANSITIONS[current]:
        raise InvalidStateTransitionError(f"Cannot move material indent from {current} to {target}.")
    return target
