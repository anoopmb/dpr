import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.audit import AuditAction
from app.models.boq import BoqTemplate, BoqTemplateItem
from app.repositories.boq_repo import BoqRepository, BoqSectionRepository
from app.schemas.boq_template import (
    BoqBulkImportResult,
    BoqTemplateCreate,
    BoqTemplateItemCreate,
    BoqTemplateItemRead,
    BoqTemplateRead,
    BoqTemplateSaveFromProject,
    BoqTemplateSummary,
)
from app.services.audit_service import AuditService
from app.services.boq_service import BoqService


class BoqTemplateService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.audit = AuditService(session)
        self.boq_service = BoqService(session)

    async def list(self) -> list[BoqTemplateSummary]:
        rows = await self.session.execute(
            select(
                BoqTemplate.id,
                BoqTemplate.name,
                BoqTemplate.description,
                func.count(BoqTemplateItem.id).label("item_count"),
            )
            .outerjoin(BoqTemplateItem, BoqTemplateItem.template_id == BoqTemplate.id)
            .group_by(BoqTemplate.id)
            .order_by(BoqTemplate.name)
        )
        return [
            BoqTemplateSummary(id=row.id, name=row.name, description=row.description, item_count=row.item_count)
            for row in rows
        ]

    async def get(self, template_id: uuid.UUID) -> BoqTemplateRead:
        template = await self.session.get(BoqTemplate, template_id)
        if template is None:
            raise NotFoundError(f"BOQ template {template_id} not found.")
        await self.session.refresh(template, ["items"])
        return BoqTemplateRead(
            id=template.id,
            name=template.name,
            description=template.description,
            items=[BoqTemplateItemRead.model_validate(i) for i in template.items],
        )

    async def create(self, data: BoqTemplateCreate, actor_id: uuid.UUID) -> BoqTemplateRead:
        template = BoqTemplate(name=data.name, description=data.description)
        self.session.add(template)
        await self.session.flush()

        for item_data in data.items:
            item = BoqTemplateItem(
                template_id=template.id,
                **item_data.model_dump(),
            )
            self.session.add(item)

        await self.session.flush()
        await self.audit.record(
            entity_type="BOQ_TEMPLATE",
            entity_id=template.id,
            action=AuditAction.CREATE,
            actor_id=actor_id,
            after={"name": template.name, "description": template.description, "item_count": len(data.items)},
        )
        await self.session.commit()
        return await self.get(template.id)

    async def create_from_project(
        self, project_id: uuid.UUID, data: BoqTemplateSaveFromProject, actor_id: uuid.UUID
    ) -> BoqTemplateRead:
        sections = await BoqSectionRepository(self.session).list_for_project(project_id)
        items = await BoqRepository(self.session).list_for_project(project_id)

        if not items:
            from app.core.exceptions import DomainError
            raise DomainError("This project has no BOQ items to save as a template.")

        section_meta: dict[uuid.UUID, tuple[str, str]] = {s.id: (s.section_no, s.section_name) for s in sections}

        template_items = [
            BoqTemplateItemCreate(
                section_no=section_meta[i.section_id][0] if i.section_id else None,
                section_name=section_meta[i.section_id][1] if i.section_id else None,
                item_no=i.item_no,
                description=i.description,
                work_type_id=i.work_type_id,
                uom_id=i.uom_id,
                tendered_qty=i.tendered_qty,
                rate=i.rate,
            )
            for i in items
        ]

        return await self.create(
            BoqTemplateCreate(name=data.name, description=data.description, items=template_items),
            actor_id=actor_id,
        )

    async def delete(self, template_id: uuid.UUID, actor_id: uuid.UUID) -> None:
        template = await self.session.get(BoqTemplate, template_id)
        if template is None:
            raise NotFoundError(f"BOQ template {template_id} not found.")
        before = {"name": template.name, "description": template.description}
        entity_id = template.id
        await self.session.delete(template)
        await self.audit.record(
            entity_type="BOQ_TEMPLATE",
            entity_id=entity_id,
            action=AuditAction.DELETE,
            actor_id=actor_id,
            before=before,
        )
        await self.session.commit()

    async def apply_to_project(
        self, template_id: uuid.UUID, project_id: uuid.UUID, actor_id: uuid.UUID
    ) -> BoqBulkImportResult:
        template = await self.session.get(BoqTemplate, template_id)
        if template is None:
            raise NotFoundError(f"BOQ template {template_id} not found.")
        await self.session.refresh(template, ["items"])

        items = [
            BoqTemplateItemCreate(
                section_no=i.section_no,
                section_name=i.section_name,
                item_no=i.item_no,
                description=i.description,
                work_type_id=i.work_type_id,
                uom_id=i.uom_id,
                tendered_qty=i.tendered_qty,
                rate=i.rate,
            )
            for i in template.items
        ]

        return await self.boq_service.bulk_import(project_id, items, actor_id)
