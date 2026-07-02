"""Shared submission-lock rule for everything under a DPR header: once the
header leaves DRAFT (submitted, at any configured intermediate review
level, or fully approved), its child entities (materials, machinery,
labour, expenses, measurements, attendance) are locked for create/update/
delete — except for a Project Manager or Admin, who may still make
corrections during review."""

from app.core.exceptions import PermissionDeniedError
from app.models.user import UserRole

LOCK_BYPASS_ROLES = (UserRole.PROJECT_MANAGER, UserRole.ADMIN)


def assert_dpr_editable(header_status: str | None, actor_role: UserRole) -> bool:
    """Raises PermissionDeniedError if this mutation isn't allowed.

    Returns True when this is a bypass edit on an already-submitted DPR
    (caller should stamp edited_by/edited_at), False for a normal DRAFT-mode
    edit or when there's no DPR header yet to lock against.
    """
    if header_status is None or header_status == "DRAFT":
        return False
    if actor_role not in LOCK_BYPASS_ROLES:
        raise PermissionDeniedError(
            "This DPR has been submitted — only a Project Manager or Admin can edit entries now."
        )
    return True
