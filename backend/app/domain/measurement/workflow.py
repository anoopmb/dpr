"""Approval state machine for measurement entries.

DRAFT, SUBMITTED, and REJECTED are fixed, built-in bookend statuses — they're
load-bearing for unrelated features (recall-to-draft, edit-only-while-DRAFT,
etc.) and aren't admin-configurable. The approval chain in between (how many
review levels, their status codes, and whether each allows rejection) is
configurable per project via WorkflowDefinition/WorkflowStage — see
app.services.workflow_config_service. This module validates transitions
against that dynamic level list rather than a single hardcoded mapping.

LOCKED is a separate fixed action (see MeasurementService.lock) reached only
once a measurement is at its workflow's final-approval level — it isn't part
of the generic transition() below.
"""

from dataclasses import dataclass

from app.core.exceptions import InvalidStateTransitionError

DRAFT = "DRAFT"
SUBMITTED = "SUBMITTED"
REJECTED = "REJECTED"
LOCKED = "LOCKED"


@dataclass(frozen=True)
class WorkflowLevel:
    status_code: str
    allow_reject: bool


def valid_targets(current: str, levels: list[WorkflowLevel]) -> set[str]:
    if current == DRAFT:
        return {SUBMITTED}
    if current == REJECTED:
        return {DRAFT}
    if not levels:
        return set()

    codes = [lvl.status_code for lvl in levels]

    if current == SUBMITTED:
        targets = {codes[0]}
        if levels[0].allow_reject:
            targets.add(REJECTED)
        return targets

    if current in codes:
        idx = codes.index(current)
        if idx + 1 < len(levels):
            targets = {codes[idx + 1]}
            if levels[idx + 1].allow_reject:
                targets.add(REJECTED)
            return targets
        return set()  # already at the final approval level — see lock()

    return set()


def transition(current: str, target: str, levels: list[WorkflowLevel]) -> str:
    if target not in valid_targets(current, levels):
        raise InvalidStateTransitionError(f"Cannot move measurement from {current} to {target}.")
    return target
