import uuid
from datetime import datetime, timezone

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import InvalidStateTransitionError, NotFoundError, PermissionDeniedError
from app.domain.material.validators import (
    IndentItemSnapshot,
    validate_issue,
    validate_receipt,
    validate_source_location_matches_type,
)
from app.domain.material.workflow import MaterialIndentStatus, transition
from app.models.material import MaterialIndent, MaterialIndentItem, MaterialIssue, MaterialReceipt
from app.models.stock_location import StockLocation
from app.models.user import UserRole
from app.repositories.material_repo import MaterialIndentItemRepository, MaterialIndentRepository
from app.schemas.material import MaterialIndentCreate, MaterialIssueCreate, MaterialReceiptCreate
from app.services.notification_service import NotificationService
from app.services.project_assignment_service import ProjectAssignmentService

_APPROVER_ROLES = (UserRole.STORE_KEEPER, UserRole.PROJECT_MANAGER, UserRole.ADMIN)
_ISSUER_ROLES = (UserRole.STORE_KEEPER, UserRole.PROJECT_MANAGER, UserRole.ADMIN)
_RECEIVER_ROLES = (UserRole.SITE_ENGINEER, UserRole.PROJECT_MANAGER, UserRole.ADMIN)
_INDENTS_LINK = "/material-indents"
# Approvers (PM/Store Keeper) use the desktop page; the requester (often a
# Site Engineer, locked out of that desktop-only route) gets the
# field-accessible equivalent instead.
_INDENTS_FIELD_LINK = "/field/my-indents"


class MaterialIndentService:
    def __init__(self, session: AsyncSession, background_tasks: BackgroundTasks | None = None) -> None:
        self.session = session
        self.repo = MaterialIndentRepository(session)
        self.item_repo = MaterialIndentItemRepository(session)
        self.notification_service = NotificationService(session, background_tasks)
        self.assignment_service = ProjectAssignmentService(session)

    async def create(self, data: MaterialIndentCreate, requested_by: uuid.UUID) -> MaterialIndent:
        location = await self.session.get(StockLocation, data.source_location_id)
        if location is None:
            raise NotFoundError(f"Stock location {data.source_location_id} not found.")
        validate_source_location_matches_type(data.source_type, location.location_type)

        indent = MaterialIndent(
            requesting_project_id=data.requesting_project_id,
            source_type=data.source_type,
            source_location_id=data.source_location_id,
            requested_by=requested_by,
            needed_by_date=data.needed_by_date,
            status=MaterialIndentStatus.DRAFT,
        )
        indent.items = [
            MaterialIndentItem(material_id=item.material_id, uom_id=item.uom_id, requested_qty=item.requested_qty)
            for item in data.items
        ]
        self.repo.add(indent)
        await self.session.commit()
        return await self.get(indent.id)

    async def list_for_project(self, project_id: uuid.UUID) -> list[MaterialIndent]:
        return await self.repo.list_for_project(project_id)

    async def get(self, indent_id: uuid.UUID) -> MaterialIndent:
        indent = await self.repo.get_with_items(indent_id)
        if indent is None:
            raise NotFoundError(f"Material indent {indent_id} not found.")
        return indent

    async def submit(self, indent_id: uuid.UUID, actor_id: uuid.UUID, actor_role: UserRole) -> MaterialIndent:
        indent = await self.get(indent_id)
        if indent.requested_by != actor_id and actor_role != UserRole.ADMIN:
            raise PermissionDeniedError("Only the requester can submit this indent.")
        indent.status = transition(MaterialIndentStatus(indent.status), MaterialIndentStatus.SUBMITTED)
        await self.session.commit()
        result = await self.get(indent_id)

        pm_ids = await self.assignment_service.resolve_users_for_role(
            indent.requesting_project_id, UserRole.PROJECT_MANAGER
        )
        store_keeper_ids = await self.assignment_service.resolve_users_for_role(
            indent.requesting_project_id, UserRole.STORE_KEEPER
        )
        await self.notification_service.notify(
            pm_ids + store_keeper_ids,
            type="MATERIAL_INDENT_SUBMITTED",
            title="Material indent submitted",
            message="A material indent was submitted and needs your approval.",
            project_id=indent.requesting_project_id,
            link_url=_INDENTS_LINK,
            related_entity_type="MATERIAL_INDENT",
            related_entity_id=indent.id,
        )
        return result

    async def approve(self, indent_id: uuid.UUID, actor_id: uuid.UUID, actor_role: UserRole) -> MaterialIndent:
        if actor_role not in _APPROVER_ROLES:
            raise PermissionDeniedError("Only Store Keeper/Project Manager/Admin can approve an indent.")
        indent = await self.get(indent_id)
        indent.status = transition(MaterialIndentStatus(indent.status), MaterialIndentStatus.APPROVED)
        indent.approved_by = actor_id
        indent.approved_at = datetime.now(timezone.utc)
        await self.session.commit()
        result = await self.get(indent_id)

        await self.notification_service.notify(
            [indent.requested_by],
            type="MATERIAL_INDENT_APPROVED",
            title="Material indent approved",
            message="Your material indent was approved.",
            project_id=indent.requesting_project_id,
            link_url=_INDENTS_FIELD_LINK,
            related_entity_type="MATERIAL_INDENT",
            related_entity_id=indent.id,
        )
        return result

    async def reject(self, indent_id: uuid.UUID, actor_role: UserRole) -> MaterialIndent:
        if actor_role not in _APPROVER_ROLES:
            raise PermissionDeniedError("Only Store Keeper/Project Manager/Admin can reject an indent.")
        indent = await self.get(indent_id)
        indent.status = transition(MaterialIndentStatus(indent.status), MaterialIndentStatus.REJECTED)
        await self.session.commit()
        result = await self.get(indent_id)

        await self.notification_service.notify(
            [indent.requested_by],
            type="MATERIAL_INDENT_REJECTED",
            title="Material indent rejected",
            message="Your material indent was rejected.",
            project_id=indent.requesting_project_id,
            link_url=_INDENTS_FIELD_LINK,
            related_entity_type="MATERIAL_INDENT",
            related_entity_id=indent.id,
        )
        return result

    async def cancel(self, indent_id: uuid.UUID, actor_id: uuid.UUID, actor_role: UserRole) -> MaterialIndent:
        indent = await self.get(indent_id)
        if indent.requested_by != actor_id and actor_role != UserRole.ADMIN:
            raise PermissionDeniedError("Only the requester can cancel this indent.")
        was_submitted = indent.status == MaterialIndentStatus.SUBMITTED
        indent.status = transition(MaterialIndentStatus(indent.status), MaterialIndentStatus.CANCELLED)
        await self.session.commit()
        result = await self.get(indent_id)

        if was_submitted:
            pm_ids = await self.assignment_service.resolve_users_for_role(
                indent.requesting_project_id, UserRole.PROJECT_MANAGER
            )
            store_keeper_ids = await self.assignment_service.resolve_users_for_role(
                indent.requesting_project_id, UserRole.STORE_KEEPER
            )
            await self.notification_service.notify(
                pm_ids + store_keeper_ids,
                type="MATERIAL_INDENT_CANCELLED",
                title="Material indent cancelled",
                message="A material indent awaiting your review was withdrawn by the requester.",
                project_id=indent.requesting_project_id,
                link_url=_INDENTS_LINK,
                related_entity_type="MATERIAL_INDENT",
                related_entity_id=indent.id,
            )
        return result

    async def issue_item(
        self, item_id: uuid.UUID, data: MaterialIssueCreate, actor_id: uuid.UUID, actor_role: UserRole
    ) -> MaterialIndentItem:
        if actor_role not in _ISSUER_ROLES:
            raise PermissionDeniedError("Only Store Keeper/Project Manager/Admin can issue material.")

        item = await self.item_repo.get(item_id)
        if item is None:
            raise NotFoundError(f"Indent item {item_id} not found.")
        indent = await self.get(item.material_indent_id)

        if indent.status not in (MaterialIndentStatus.APPROVED, MaterialIndentStatus.ISSUED):
            raise InvalidStateTransitionError(f"Cannot issue material while indent is {indent.status}.")

        validate_issue(
            IndentItemSnapshot(
                requested_qty=item.requested_qty, issued_qty=item.issued_qty, received_qty=item.received_qty
            ),
            data.issued_qty,
        )

        self.session.add(
            MaterialIssue(
                material_indent_item_id=item.id,
                issued_qty=data.issued_qty,
                issued_by=actor_id,
                issued_at=datetime.now(timezone.utc),
                vehicle_ref=data.vehicle_ref,
            )
        )
        item.issued_qty += data.issued_qty

        if indent.status == MaterialIndentStatus.APPROVED:
            indent.status = transition(MaterialIndentStatus.APPROVED, MaterialIndentStatus.ISSUED)

        await self.session.commit()
        await self.session.refresh(item)

        site_engineer_ids = await self.assignment_service.resolve_users_for_role(
            indent.requesting_project_id, UserRole.SITE_ENGINEER
        )
        await self.notification_service.notify(
            [indent.requested_by, *site_engineer_ids],
            type="MATERIAL_INDENT_ISSUED",
            title="Material issued",
            message="Material has been issued against your indent.",
            project_id=indent.requesting_project_id,
            link_url=_INDENTS_FIELD_LINK,
            related_entity_type="MATERIAL_INDENT",
            related_entity_id=indent.id,
        )
        return item

    async def receive_item(
        self, item_id: uuid.UUID, data: MaterialReceiptCreate, actor_id: uuid.UUID, actor_role: UserRole
    ) -> MaterialIndentItem:
        if actor_role not in _RECEIVER_ROLES:
            raise PermissionDeniedError("Only Site Engineer/Project Manager/Admin can confirm receipt.")

        item = await self.item_repo.get(item_id)
        if item is None:
            raise NotFoundError(f"Indent item {item_id} not found.")
        indent = await self.get(item.material_indent_id)

        if indent.status not in (MaterialIndentStatus.ISSUED, MaterialIndentStatus.PARTIALLY_RECEIVED):
            raise InvalidStateTransitionError(f"Cannot receive material while indent is {indent.status}.")

        validate_receipt(
            IndentItemSnapshot(
                requested_qty=item.requested_qty, issued_qty=item.issued_qty, received_qty=item.received_qty
            ),
            data.received_qty,
        )

        self.session.add(
            MaterialReceipt(
                material_indent_item_id=item.id,
                received_qty=data.received_qty,
                received_by=actor_id,
                received_at=datetime.now(timezone.utc),
                photo_url=data.photo_url,
                remarks=data.remarks,
            )
        )
        item.received_qty += data.received_qty
        await self.session.flush()

        refreshed_indent = await self.get(indent.id)
        all_received = all(i.received_qty == i.requested_qty for i in refreshed_indent.items)
        any_received = any(i.received_qty > 0 for i in refreshed_indent.items)
        target_status = (
            MaterialIndentStatus.RECEIVED
            if all_received
            else MaterialIndentStatus.PARTIALLY_RECEIVED
            if any_received
            else refreshed_indent.status
        )
        if target_status != refreshed_indent.status:
            refreshed_indent.status = transition(MaterialIndentStatus(refreshed_indent.status), target_status)

        await self.session.commit()
        await self.session.refresh(item)

        pm_ids = await self.assignment_service.resolve_users_for_role(
            indent.requesting_project_id, UserRole.PROJECT_MANAGER
        )
        await self.notification_service.notify(
            pm_ids,
            type="MATERIAL_INDENT_RECEIVED",
            title="Material receipt confirmed",
            message=f"Material receipt was confirmed for indent (status: {target_status}).",
            project_id=indent.requesting_project_id,
            link_url=_INDENTS_LINK,
            related_entity_type="MATERIAL_INDENT",
            related_entity_id=indent.id,
        )
        return item
