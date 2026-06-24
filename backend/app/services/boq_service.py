import uuid
from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import DomainError, InUseError, NotFoundError
from app.domain.measurement.validators import BoqItemSnapshot, validate_measurement_against_boq
from app.models.audit import AuditAction
from app.models.boq import BoqItem, BoqSection
from app.repositories.boq_repo import BoqRepository, BoqSectionRepository
from app.schemas.boq import BoqItemCreate, BoqItemRead, BoqItemUpdate, BoqSectionCreate, BoqSectionRead, BoqSectionUpdate
from app.schemas.boq_template import BoqBulkImportResult, BoqTemplateItemCreate
from app.services.audit_service import AuditService, serialize_model


class BoqService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = BoqRepository(session)
        self.section_repo = BoqSectionRepository(session)
        self.audit = AuditService(session)

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

    async def list_sections_with_items(self, project_id: uuid.UUID) -> list[BoqSectionRead]:
        sections = await self.section_repo.list_for_project(project_id)
        items = await self.repo.list_for_project(project_id)

        items_by_section: dict[uuid.UUID, list[BoqItem]] = {}
        for item in items:
            if item.section_id is not None:
                items_by_section.setdefault(item.section_id, []).append(item)

        return [
            BoqSectionRead(
                id=s.id,
                project_id=s.project_id,
                section_no=s.section_no,
                section_name=s.section_name,
                sort_order=s.sort_order,
                items=[BoqItemRead.model_validate(i) for i in items_by_section.get(s.id, [])],
            )
            for s in sections
        ]

    async def create(self, data: BoqItemCreate, actor_id: uuid.UUID) -> BoqItem:
        item = BoqItem(**data.model_dump())
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
            tendered_qty=item.tendered_qty,
            consumed_qty=item.consumed_qty,
            has_active_variation_order=item.has_active_variation_order,
        )
        validate_measurement_against_boq(measurement_qty, snapshot)
        item.consumed_qty += measurement_qty
        await self.session.commit()
        await self.session.refresh(item)
        return item
