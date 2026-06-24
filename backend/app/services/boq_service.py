import uuid
from decimal import Decimal

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import DomainError, InUseError, NotFoundError
from app.domain.measurement.validators import BoqItemSnapshot, validate_measurement_against_boq
from app.models.boq import BoqItem, BoqSection
from app.repositories.boq_repo import BoqRepository, BoqSectionRepository
from app.schemas.boq import BoqItemCreate, BoqItemRead, BoqItemUpdate, BoqSectionCreate, BoqSectionRead, BoqSectionUpdate


class BoqService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = BoqRepository(session)
        self.section_repo = BoqSectionRepository(session)

    async def create_section(self, data: BoqSectionCreate) -> BoqSection:
        section = BoqSection(**data.model_dump())
        self.section_repo.add(section)
        await self.session.commit()
        await self.session.refresh(section)
        return section

    async def update_section(self, section_id: uuid.UUID, data: BoqSectionUpdate) -> BoqSection:
        section = await self.section_repo.get(section_id)
        if section is None:
            raise NotFoundError(f"BOQ section {section_id} not found.")
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(section, field, value)
        await self.session.commit()
        await self.session.refresh(section)
        return section

    async def delete_section(self, section_id: uuid.UUID) -> None:
        section = await self.section_repo.get(section_id)
        if section is None:
            raise NotFoundError(f"BOQ section {section_id} not found.")
        items = await self.repo.list_for_project(section.project_id)
        if any(i.section_id == section_id for i in items):
            raise DomainError("Cannot delete a section that has BOQ items. Reassign the items to another section first.")
        await self.section_repo.delete(section)
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

    async def create(self, data: BoqItemCreate) -> BoqItem:
        item = BoqItem(**data.model_dump())
        self.repo.add(item)
        await self.session.commit()
        await self.session.refresh(item)
        return item

    async def list_for_project(self, project_id: uuid.UUID) -> list[BoqItem]:
        return await self.repo.list_for_project(project_id)

    async def update_item(self, boq_item_id: uuid.UUID, data: BoqItemUpdate) -> BoqItem:
        item = await self.get(boq_item_id)
        for field, value in data.model_dump(exclude_none=True).items():
            setattr(item, field, value)
        await self.session.commit()
        await self.session.refresh(item)
        return item

    async def delete_item(self, boq_item_id: uuid.UUID) -> None:
        item = await self.get(boq_item_id)
        if item.consumed_qty > 0:
            raise DomainError(
                "Cannot delete a BOQ item that already has recorded measurements against it."
            )
        await self.repo.delete(item)
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
