import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import DomainError, InUseError, NotFoundError, PermissionDeniedError
from app.domain.measurement.validators import BoqItemSnapshot, validate_measurement_against_boq
from app.models.audit import AuditAction
from app.models.boq import BoqItem, BoqSection
from app.models.boq_revision import BoqItemRevision
from app.models.measurement import Measurement
from app.models.dpr import DprProductionEntry
from app.repositories.boq_repo import BoqRepository, BoqSectionRepository
from app.schemas.boq import BoqItemCreate, BoqItemRead, BoqItemUpdate, BoqSectionCreate, BoqSectionRead, BoqSectionUpdate
from app.schemas.boq_revision import BoqRevisionCreate
from app.schemas.boq_template import BoqBulkImportResult, BoqTemplateItemCreate
from app.services.audit_service import AuditService, serialize_model

_TYPE_PREFIX = {
    "VARIATION_ORDER": "VO",
    "RATE_AMENDMENT": "RA",
    "RECAST_ESTIMATE": "RE",
    "QTY_REVISION": "QR",
}


class BoqService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = BoqRepository(session)
        self.section_repo = BoqSectionRepository(session)
        self.audit = AuditService(session)

    # ── Effective-rate helpers ────────────────────────────────────────────────

    async def get_effective_rate(self, boq_item_id: uuid.UUID, on_date: date) -> Decimal:
        result = await self.session.execute(
            select(BoqItemRevision.revised_rate)
            .where(
                BoqItemRevision.boq_item_id == boq_item_id,
                BoqItemRevision.status == "APPROVED",
                BoqItemRevision.revised_rate.is_not(None),
                BoqItemRevision.effective_from <= on_date,
            )
            .order_by(BoqItemRevision.effective_from.desc())
            .limit(1)
        )
        revised = result.scalar_one_or_none()
        if revised is not None:
            return Decimal(str(revised))
        item = await self.session.get(BoqItem, boq_item_id)
        return item.rate if item else Decimal("0")

    async def get_effective_tendered_qty(self, boq_item_id: uuid.UUID, on_date: date) -> Decimal:
        result = await self.session.execute(
            select(BoqItemRevision.revised_tendered_qty)
            .where(
                BoqItemRevision.boq_item_id == boq_item_id,
                BoqItemRevision.status == "APPROVED",
                BoqItemRevision.revised_tendered_qty.is_not(None),
                BoqItemRevision.effective_from <= on_date,
            )
            .order_by(BoqItemRevision.effective_from.desc())
            .limit(1)
        )
        revised = result.scalar_one_or_none()
        if revised is not None:
            return Decimal(str(revised))
        item = await self.session.get(BoqItem, boq_item_id)
        return item.tendered_qty if item else Decimal("0")

    async def _refresh_current_cache(self, item: BoqItem) -> None:
        today = date.today()
        item.current_rate = await self.get_effective_rate(item.id, today)
        item.current_tendered_qty = await self.get_effective_tendered_qty(item.id, today)

    # ── Revision CRUD ─────────────────────────────────────────────────────────

    async def _next_revision_number(self, boq_item_id: uuid.UUID, revision_type: str) -> str:
        prefix = _TYPE_PREFIX[revision_type]
        count_result = await self.session.execute(
            select(func.count()).where(
                BoqItemRevision.boq_item_id == boq_item_id,
                BoqItemRevision.revision_type == revision_type,
            )
        )
        count = count_result.scalar_one()
        return f"{prefix}-{str(count + 1).zfill(3)}"

    async def _has_work(self, boq_item_id: uuid.UUID) -> bool:
        m_count = await self.session.scalar(
            select(func.count()).where(Measurement.boq_item_id == boq_item_id)
        )
        p_count = await self.session.scalar(
            select(func.count()).where(DprProductionEntry.boq_item_id == boq_item_id)
        )
        return (m_count or 0) > 0 or (p_count or 0) > 0

    async def create_revision(
        self, boq_item_id: uuid.UUID, data: BoqRevisionCreate, actor_id: uuid.UUID
    ) -> BoqItemRevision:
        item = await self.get(boq_item_id)
        if data.revised_rate is None and data.revised_tendered_qty is None:
            raise DomainError("A revision must change at least one of: revised_rate, revised_tendered_qty.")
        revision_number = await self._next_revision_number(boq_item_id, data.revision_type)
        revision = BoqItemRevision(
            boq_item_id=boq_item_id,
            revision_number=revision_number,
            revision_type=data.revision_type,
            status="PENDING",
            effective_from=data.effective_from,
            revised_rate=data.revised_rate,
            revised_tendered_qty=data.revised_tendered_qty,
            reason=data.reason,
            created_by_user_id=actor_id,
        )
        self.session.add(revision)
        try:
            await self.session.flush()
        except IntegrityError:
            await self.session.rollback()
            raise DomainError("Concurrent revision submitted. Please retry.")
        await self.audit.record(
            entity_type="BOQ_REVISION",
            entity_id=revision.id,
            action=AuditAction.CREATE,
            actor_id=actor_id,
            after=serialize_model(revision),
        )
        await self.session.commit()
        await self.session.refresh(revision)
        return revision

    async def approve_revision(self, revision_id: uuid.UUID, actor_id: uuid.UUID) -> BoqItemRevision:
        revision = await self.session.get(BoqItemRevision, revision_id)
        if revision is None:
            raise NotFoundError(f"BOQ revision {revision_id} not found.")
        if revision.status != "PENDING":
            raise DomainError(f"Only PENDING revisions can be approved (current status: {revision.status}).")
        before = serialize_model(revision)
        revision.status = "APPROVED"
        revision.approved_by_user_id = actor_id
        revision.approved_at = datetime.now(tz=timezone.utc)
        await self.session.flush()

        item = await self.session.get(BoqItem, revision.boq_item_id)
        if item:
            await self._refresh_current_cache(item)
            if revision.revision_type == "VARIATION_ORDER":
                item.has_active_variation_order = True

        await self.audit.record(
            entity_type="BOQ_REVISION",
            entity_id=revision.id,
            action=AuditAction.UPDATE,
            actor_id=actor_id,
            before=before,
            after=serialize_model(revision),
        )
        await self.session.commit()
        await self.session.refresh(revision)
        return revision

    async def reject_revision(
        self, revision_id: uuid.UUID, actor_id: uuid.UUID, rejected_reason: str
    ) -> BoqItemRevision:
        revision = await self.session.get(BoqItemRevision, revision_id)
        if revision is None:
            raise NotFoundError(f"BOQ revision {revision_id} not found.")
        if revision.status != "PENDING":
            raise DomainError(f"Only PENDING revisions can be rejected (current status: {revision.status}).")
        before = serialize_model(revision)
        revision.status = "REJECTED"
        revision.rejected_reason = rejected_reason
        revision.approved_by_user_id = actor_id
        revision.approved_at = datetime.now(tz=timezone.utc)
        await self.session.flush()
        await self.audit.record(
            entity_type="BOQ_REVISION",
            entity_id=revision.id,
            action=AuditAction.UPDATE,
            actor_id=actor_id,
            before=before,
            after=serialize_model(revision),
        )
        await self.session.commit()
        await self.session.refresh(revision)
        return revision

    async def list_revisions(self, boq_item_id: uuid.UUID) -> list[BoqItemRevision]:
        result = await self.session.execute(
            select(BoqItemRevision)
            .where(BoqItemRevision.boq_item_id == boq_item_id)
            .order_by(BoqItemRevision.effective_from.desc(), BoqItemRevision.created_at.desc())
        )
        return list(result.scalars().all())

    async def list_pending_revisions(self, project_id: uuid.UUID) -> list[BoqItemRevision]:
        result = await self.session.execute(
            select(BoqItemRevision)
            .join(BoqItem, BoqItem.id == BoqItemRevision.boq_item_id)
            .where(
                BoqItem.project_id == project_id,
                BoqItemRevision.status == "PENDING",
            )
            .order_by(BoqItemRevision.created_at.asc())
        )
        return list(result.scalars().all())

    # ── Section CRUD ──────────────────────────────────────────────────────────

    async def create_section(self, data: BoqSectionCreate, actor_id: uuid.UUID) -> BoqSection:
        section = BoqSection(**data.model_dump())
        self.section_repo.add(section)
        await self.session.flush()
        await self.audit.record(
            entity_type="BOQ_SECTION",
            entity_id=section.id,
            action=AuditAction.CREATE,
            actor_id=actor_id,
            after=serialize_model(section),
        )
        await self.session.commit()
        await self.session.refresh(section)
        return section

    async def update_section(self, section_id: uuid.UUID, data: BoqSectionUpdate, actor_id: uuid.UUID) -> BoqSection:
        section = await self.section_repo.get(section_id)
        if section is None:
            raise NotFoundError(f"BOQ section {section_id} not found.")
        before = serialize_model(section)
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(section, field, value)
        await self.session.flush()
        await self.audit.record(
            entity_type="BOQ_SECTION",
            entity_id=section.id,
            action=AuditAction.UPDATE,
            actor_id=actor_id,
            before=before,
            after=serialize_model(section),
        )
        await self.session.commit()
        await self.session.refresh(section)
        return section

    async def delete_section(self, section_id: uuid.UUID, actor_id: uuid.UUID) -> None:
        section = await self.section_repo.get(section_id)
        if section is None:
            raise NotFoundError(f"BOQ section {section_id} not found.")
        items = await self.repo.list_for_project(section.project_id)
        if any(i.section_id == section_id for i in items):
            raise DomainError("Cannot delete a section that has BOQ items. Reassign the items to another section first.")
        before = serialize_model(section)
        entity_id = section.id
        await self.section_repo.delete(section)
        await self.audit.record(
            entity_type="BOQ_SECTION",
            entity_id=entity_id,
            action=AuditAction.DELETE,
            actor_id=actor_id,
            before=before,
        )
        await self.session.commit()

    _UNSECTIONED_ID = uuid.UUID(int=0)

    async def list_sections_with_items(self, project_id: uuid.UUID) -> list[BoqSectionRead]:
        sections = await self.section_repo.list_for_project(project_id)
        items = await self.repo.list_for_project(project_id)

        item_ids = [i.id for i in items]
        rev_counts: dict[uuid.UUID, int] = {}
        if item_ids:
            rc_result = await self.session.execute(
                select(BoqItemRevision.boq_item_id, func.count().label("cnt"))
                .where(BoqItemRevision.boq_item_id.in_(item_ids))
                .group_by(BoqItemRevision.boq_item_id)
            )
            rev_counts = {row.boq_item_id: row.cnt for row in rc_result}

        _ITEM_FIELDS = (
            "id", "project_id", "section_id", "work_type_id", "uom_id",
            "item_no", "description", "tendered_qty", "rate",
            "current_rate", "current_tendered_qty", "consumed_qty",
            "has_active_variation_order", "construction_type",
        )

        def make_item_read(i: BoqItem) -> BoqItemRead:
            return BoqItemRead(
                **{k: getattr(i, k) for k in _ITEM_FIELDS},
                revision_count=rev_counts.get(i.id, 0),
            )

        items_by_section: dict[uuid.UUID, list[BoqItem]] = {}
        unsectioned: list[BoqItem] = []
        for item in items:
            if item.section_id is not None:
                items_by_section.setdefault(item.section_id, []).append(item)
            else:
                unsectioned.append(item)

        result: list[BoqSectionRead] = [
            BoqSectionRead(
                id=s.id,
                project_id=s.project_id,
                section_no=s.section_no,
                section_name=s.section_name,
                sort_order=s.sort_order,
                items=[make_item_read(i) for i in items_by_section.get(s.id, [])],
            )
            for s in sections
        ]

        if unsectioned:
            result.append(
                BoqSectionRead(
                    id=self._UNSECTIONED_ID,
                    project_id=project_id,
                    section_no="—",
                    section_name="Unsectioned Items",
                    sort_order=99999,
                    items=[make_item_read(i) for i in unsectioned],
                )
            )

        return result

    # ── Item CRUD ─────────────────────────────────────────────────────────────

    async def create(self, data: BoqItemCreate, actor_id: uuid.UUID) -> BoqItem:
        item = BoqItem(
            **data.model_dump(),
            current_rate=data.rate,
            current_tendered_qty=data.tendered_qty,
        )
        self.repo.add(item)
        await self.session.flush()
        await self.audit.record(
            entity_type="BOQ_ITEM",
            entity_id=item.id,
            action=AuditAction.CREATE,
            actor_id=actor_id,
            after=serialize_model(item),
        )
        await self.session.commit()
        await self.session.refresh(item)
        return item

    async def list_for_project(self, project_id: uuid.UUID) -> list[BoqItem]:
        return await self.repo.list_for_project(project_id)

    async def update_item(self, boq_item_id: uuid.UUID, data: BoqItemUpdate, actor_id: uuid.UUID) -> BoqItem:
        item = await self.get(boq_item_id)
        before = serialize_model(item)
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(item, field, value)
        await self.session.flush()
        await self.audit.record(
            entity_type="BOQ_ITEM",
            entity_id=item.id,
            action=AuditAction.UPDATE,
            actor_id=actor_id,
            before=before,
            after=serialize_model(item),
        )
        await self.session.commit()
        await self.session.refresh(item)
        return item

    async def delete_item(self, boq_item_id: uuid.UUID, actor_id: uuid.UUID) -> None:
        item = await self.get(boq_item_id)
        if item.consumed_qty > 0:
            raise DomainError(
                "Cannot delete a BOQ item that already has recorded measurements against it."
            )
        before = serialize_model(item)
        entity_id = item.id
        await self.repo.delete(item)
        await self.audit.record(
            entity_type="BOQ_ITEM",
            entity_id=entity_id,
            action=AuditAction.DELETE,
            actor_id=actor_id,
            before=before,
        )
        try:
            await self.session.commit()
        except IntegrityError:
            await self.session.rollback()
            raise InUseError(
                "Cannot delete — this BOQ item is referenced by pending measurements."
            )

    async def get(self, boq_item_id: uuid.UUID) -> BoqItem:
        item = await self.repo.get(boq_item_id)
        if item is None:
            raise NotFoundError(f"BOQ item {boq_item_id} not found.")
        return item

    async def get_item_read(self, boq_item_id: uuid.UUID) -> BoqItemRead:
        item = await self.get(boq_item_id)
        rev_count = await self.session.scalar(
            select(func.count()).where(BoqItemRevision.boq_item_id == boq_item_id)
        )
        return BoqItemRead(
            **{k: getattr(item, k) for k in (
                "id", "project_id", "section_id", "work_type_id", "uom_id",
                "item_no", "description", "tendered_qty", "rate",
                "current_rate", "current_tendered_qty", "consumed_qty",
                "has_active_variation_order", "construction_type",
            )},
            revision_count=rev_count or 0,
        )

    async def bulk_import(
        self,
        project_id: uuid.UUID,
        items: list[BoqTemplateItemCreate],
        actor_id: uuid.UUID,
    ) -> BoqBulkImportResult:
        existing_sections = await self.section_repo.list_for_project(project_id)
        section_map: dict[str, uuid.UUID] = {s.section_no: s.id for s in existing_sections}
        max_sort = max((s.sort_order for s in existing_sections), default=-1)

        seen_section_nos: dict[str, str] = {}
        for item in items:
            if item.section_no and item.section_no not in section_map and item.section_no not in seen_section_nos:
                seen_section_nos[item.section_no] = item.section_name or item.section_no

        added_sections = 0
        for section_no, section_name in seen_section_nos.items():
            max_sort += 1
            section = BoqSection(
                project_id=project_id,
                section_no=section_no,
                section_name=section_name,
                sort_order=max_sort,
            )
            self.section_repo.add(section)
            await self.session.flush()
            await self.audit.record(
                entity_type="BOQ_SECTION",
                entity_id=section.id,
                action=AuditAction.CREATE,
                actor_id=actor_id,
                after=serialize_model(section),
            )
            section_map[section_no] = section.id
            added_sections += 1

        existing_items = await self.repo.list_for_project(project_id)
        existing_item_nos: set[str] = {i.item_no for i in existing_items}

        added_items = 0
        skipped_items = 0
        for item_data in items:
            if item_data.item_no in existing_item_nos:
                skipped_items += 1
                continue
            section_id = section_map.get(item_data.section_no) if item_data.section_no else None
            boq_item = BoqItem(
                project_id=project_id,
                section_id=section_id,
                work_type_id=item_data.work_type_id,
                uom_id=item_data.uom_id,
                item_no=item_data.item_no,
                description=item_data.description,
                tendered_qty=item_data.tendered_qty,
                rate=item_data.rate,
                current_rate=item_data.rate,
                current_tendered_qty=item_data.tendered_qty,
            )
            self.repo.add(boq_item)
            await self.session.flush()
            await self.audit.record(
                entity_type="BOQ_ITEM",
                entity_id=boq_item.id,
                action=AuditAction.CREATE,
                actor_id=actor_id,
                after=serialize_model(boq_item),
            )
            existing_item_nos.add(item_data.item_no)
            added_items += 1

        await self.session.commit()
        return BoqBulkImportResult(
            added_sections=added_sections,
            added_items=added_items,
            skipped_items=skipped_items,
        )

    async def record_consumption(self, boq_item_id: uuid.UUID, measurement_qty: Decimal) -> BoqItem:
        item = await self.get(boq_item_id)
        snapshot = BoqItemSnapshot(
            tendered_qty=item.current_tendered_qty,
            consumed_qty=item.consumed_qty,
            has_active_variation_order=item.has_active_variation_order,
        )
        validate_measurement_against_boq(measurement_qty, snapshot)
        item.consumed_qty += measurement_qty
        await self.session.commit()
        await self.session.refresh(item)
        return item
