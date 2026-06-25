import calendar
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import DomainError, NotFoundError, PermissionDeniedError
from app.core.timezone import get_org_today
from app.domain.dpr.validators import validate_report_date
from app.models.audit import AuditAction
from app.models.dpr import DprHeader, DprIssue, DprMachinery, DprMaterial, DprProductionEntry, DprStatus, DprWorkItem
from app.models.master_data import MachineryMaster, MaterialMaster, UomMaster
from app.models.project import Project
from app.models.user import UserRole
from app.repositories.boq_repo import BoqRepository, BoqSectionRepository
from app.repositories.dpr_repo import DprProductionRepository, DprRepository
from app.repositories.measurement_repo import MeasurementRepository
from app.schemas.dpr import (
    BoqItemProgressRead,
    DprHeaderCreate,
    DprHeaderUpdate,
    DprIssueCreate,
    DprMachineryCreate,
    DprMachineryUpdate,
    DprMaterialCreate,
    DprMaterialUpdate,
    DprProductionBulkUpsert,
    DprWorkItemCreate,
    ProductionProgressRead,
    SectionProgressRead,
)
from app.schemas.dpr_report import (
    DailyProductionCell,
    DprMonthlyReportRead,
    DprReportItemRead,
    DprReportSectionRead,
)
from app.services.audit_service import AuditService, serialize_model
from app.services.notification_service import NotificationService
from app.services.project_assignment_service import ProjectAssignmentService

_DPR_LINK = "/dpr-history"


class DuplicateDprError(DomainError):
    error_code = "DUPLICATE_DPR_FOR_DATE"


class DprService:
    def __init__(self, session: AsyncSession, background_tasks: BackgroundTasks | None = None) -> None:
        self.session = session
        self.repo = DprRepository(session)
        self.notification_service = NotificationService(session, background_tasks)
        self.assignment_service = ProjectAssignmentService(session)
        self.audit = AuditService(session)

    async def create_header(
        self, data: DprHeaderCreate, submitted_by: uuid.UUID, default_supervisor_name: str | None = None
    ) -> DprHeader:
        project = await self.session.get(Project, data.project_id)
        if project is None:
            raise NotFoundError(f"Project {data.project_id} not found.")

        validate_report_date(data.report_date, project.start_date, await get_org_today(self.session))

        existing = await self.repo.get_by_project_and_date(data.project_id, data.report_date)
        if existing is not None:
            raise DuplicateDprError(f"A DPR for {data.report_date} already exists for this project.")

        header = DprHeader(
            project_id=data.project_id,
            report_date=data.report_date,
            weather=data.weather,
            daily_work_summary=data.daily_work_summary,
            supervisor_name=data.supervisor_name or default_supervisor_name,
            no_work=data.no_work,
            no_work_reason=data.no_work_reason,
            submitted_by=submitted_by,
            status=DprStatus.DRAFT,
        )
        self.repo.add(header)
        await self.session.flush()
        await self.audit.record(
            entity_type="DPR_HEADER",
            entity_id=header.id,
            action=AuditAction.CREATE,
            actor_id=submitted_by,
            after=serialize_model(header),
        )
        await self.session.commit()
        return await self.get(header.id)

    async def update_header(self, header_id: uuid.UUID, data: DprHeaderUpdate, actor_id: uuid.UUID) -> DprHeader:
        header = await self.session.get(DprHeader, header_id)
        if header is None:
            raise NotFoundError(f"DPR {header_id} not found.")
        if header.status != DprStatus.DRAFT:
            raise PermissionDeniedError("Cannot update a submitted DPR.")

        if data.no_work is True and not header.no_work:
            full_header = await self.get(header_id)
            production_entries = await DprProductionRepository(self.session).list_for_header(header_id)
            if full_header.materials or full_header.machinery_entries or full_header.work_items or production_entries:
                raise DomainError(
                    "Cannot mark this DPR as a no-work day: it already has production, material, "
                    "or machinery entries. Remove them first."
                )

        before = serialize_model(header)
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(header, field, value)
        await self.session.flush()
        await self.audit.record(
            entity_type="DPR_HEADER",
            entity_id=header.id,
            action=AuditAction.UPDATE,
            actor_id=actor_id,
            before=before,
            after=serialize_model(header),
        )
        await self.session.commit()
        return await self.get(header_id)

    async def list_for_project(self, project_id: uuid.UUID) -> list[DprHeader]:
        return await self.repo.list_for_project(project_id)

    async def get(self, header_id: uuid.UUID) -> DprHeader:
        header = await self.repo.get_with_children(header_id)
        if header is None:
            raise NotFoundError(f"DPR {header_id} not found.")
        return header

    async def _get_editable_header(self, header_id: uuid.UUID) -> DprHeader:
        header = await self.get(header_id)
        if header.status != DprStatus.DRAFT:
            raise PermissionDeniedError("This DPR has already been submitted and can no longer be edited.")
        return header

    async def _get_editable_work_header(self, header_id: uuid.UUID) -> DprHeader:
        header = await self._get_editable_header(header_id)
        if header.no_work:
            raise DomainError("Cannot add work, material, or machinery entries on a no-work day.")
        return header

    async def add_work_item(self, header_id: uuid.UUID, data: DprWorkItemCreate, actor_id: uuid.UUID) -> DprHeader:
        await self._get_editable_work_header(header_id)
        item = DprWorkItem(dpr_header_id=header_id, **data.model_dump())
        self.session.add(item)
        await self.session.flush()
        await self.audit.record(
            entity_type="DPR_WORK_ITEM",
            entity_id=item.id,
            action=AuditAction.CREATE,
            actor_id=actor_id,
            after=serialize_model(item),
        )
        await self.session.commit()
        return await self.get(header_id)

    async def add_issue(self, header_id: uuid.UUID, data: DprIssueCreate, actor_id: uuid.UUID) -> DprHeader:
        await self._get_editable_header(header_id)
        issue = DprIssue(dpr_header_id=header_id, **data.model_dump())
        self.session.add(issue)
        await self.session.flush()
        await self.audit.record(
            entity_type="DPR_ISSUE",
            entity_id=issue.id,
            action=AuditAction.CREATE,
            actor_id=actor_id,
            after=serialize_model(issue),
        )
        await self.session.commit()
        return await self.get(header_id)

    async def add_material(self, header_id: uuid.UUID, data: DprMaterialCreate, actor_id: uuid.UUID) -> DprHeader:
        await self._get_editable_work_header(header_id)
        payload = data.model_dump()
        if payload["rate"] is None:
            mat = await self.session.get(MaterialMaster, data.material_id)
            if mat is not None:
                payload["rate"] = mat.cost_rate
        material = DprMaterial(dpr_header_id=header_id, **payload)
        self.session.add(material)
        await self.session.flush()
        await self.audit.record(
            entity_type="DPR_MATERIAL",
            entity_id=material.id,
            action=AuditAction.CREATE,
            actor_id=actor_id,
            after=serialize_model(material),
        )
        await self.session.commit()
        return await self.get(header_id)

    async def add_machinery(self, header_id: uuid.UUID, data: DprMachineryCreate, actor_id: uuid.UUID) -> DprHeader:
        await self._get_editable_work_header(header_id)
        payload = data.model_dump()
        if payload["hire_rate"] is None:
            machinery = await self.session.get(MachineryMaster, data.machinery_id)
            if machinery is not None:
                payload["hire_rate"] = machinery.hire_rate
        entry = DprMachinery(dpr_header_id=header_id, **payload)
        self.session.add(entry)
        await self.session.flush()
        await self.audit.record(
            entity_type="DPR_MACHINERY",
            entity_id=entry.id,
            action=AuditAction.CREATE,
            actor_id=actor_id,
            after=serialize_model(entry),
        )
        await self.session.commit()
        return await self.get(header_id)

    async def update_material(
        self, item_id: uuid.UUID, data: DprMaterialUpdate, actor_id: uuid.UUID
    ) -> DprHeader:
        material = await self.session.get(DprMaterial, item_id)
        if material is None:
            raise NotFoundError(f"DPR material entry {item_id} not found.")
        header = await self.session.get(DprHeader, material.dpr_header_id)
        if header is None or header.status != DprStatus.DRAFT:
            raise PermissionDeniedError("Can only edit material entries on a DRAFT DPR.")
        before = serialize_model(material)
        material.qty_consumed = data.qty_consumed
        material.uom_id = data.uom_id
        material.rate = data.rate
        await self.session.flush()
        await self.audit.record(
            entity_type="DPR_MATERIAL",
            entity_id=material.id,
            action=AuditAction.UPDATE,
            actor_id=actor_id,
            before=before,
            after=serialize_model(material),
        )
        await self.session.commit()
        return await self.get(material.dpr_header_id)

    async def delete_material(self, item_id: uuid.UUID, actor_id: uuid.UUID) -> None:
        material = await self.session.get(DprMaterial, item_id)
        if material is None:
            raise NotFoundError(f"DPR material entry {item_id} not found.")
        header = await self.session.get(DprHeader, material.dpr_header_id)
        if header is None or header.status != DprStatus.DRAFT:
            raise PermissionDeniedError("Can only delete material entries on a DRAFT DPR.")
        before = serialize_model(material)
        entity_id = material.id
        await self.session.delete(material)
        await self.audit.record(
            entity_type="DPR_MATERIAL",
            entity_id=entity_id,
            action=AuditAction.DELETE,
            actor_id=actor_id,
            before=before,
        )
        await self.session.commit()

    async def update_machinery(
        self, item_id: uuid.UUID, data: DprMachineryUpdate, actor_id: uuid.UUID
    ) -> DprHeader:
        entry = await self.session.get(DprMachinery, item_id)
        if entry is None:
            raise NotFoundError(f"DPR machinery entry {item_id} not found.")
        header = await self.session.get(DprHeader, entry.dpr_header_id)
        if header is None or header.status != DprStatus.DRAFT:
            raise PermissionDeniedError("Can only edit machinery entries on a DRAFT DPR.")
        before = serialize_model(entry)
        entry.hours_used = data.hours_used
        entry.hire_rate = data.hire_rate
        await self.session.flush()
        await self.audit.record(
            entity_type="DPR_MACHINERY",
            entity_id=entry.id,
            action=AuditAction.UPDATE,
            actor_id=actor_id,
            before=before,
            after=serialize_model(entry),
        )
        await self.session.commit()
        return await self.get(entry.dpr_header_id)

    async def delete_machinery(self, item_id: uuid.UUID, actor_id: uuid.UUID) -> None:
        entry = await self.session.get(DprMachinery, item_id)
        if entry is None:
            raise NotFoundError(f"DPR machinery entry {item_id} not found.")
        header = await self.session.get(DprHeader, entry.dpr_header_id)
        if header is None or header.status != DprStatus.DRAFT:
            raise PermissionDeniedError("Can only delete machinery entries on a DRAFT DPR.")
        before = serialize_model(entry)
        entity_id = entry.id
        await self.session.delete(entry)
        await self.audit.record(
            entity_type="DPR_MACHINERY",
            entity_id=entity_id,
            action=AuditAction.DELETE,
            actor_id=actor_id,
            before=before,
        )
        await self.session.commit()

    async def submit(self, header_id: uuid.UUID, actor_id: uuid.UUID) -> DprHeader:
        header = await self._get_editable_header(header_id)
        before = serialize_model(header)
        header.status = DprStatus.SUBMITTED
        header.submitted_at = datetime.now(timezone.utc)
        await self.session.flush()
        await self.audit.record(
            entity_type="DPR_HEADER",
            entity_id=header.id,
            action=AuditAction.STATUS_CHANGE,
            actor_id=actor_id,
            before=before,
            after=serialize_model(header),
        )
        await self.session.commit()
        result = await self.get(header_id)

        pm_ids = await self.assignment_service.resolve_users_for_role(header.project_id, UserRole.PROJECT_MANAGER)
        await self.notification_service.notify(
            pm_ids,
            type="DPR_SUBMITTED",
            title="DPR submitted",
            message=f"A DPR for {header.report_date} was submitted.",
            project_id=header.project_id,
            link_url=_DPR_LINK,
            related_entity_type="DPR_HEADER",
            related_entity_id=header.id,
        )
        return result

    async def delete_header(self, header_id: uuid.UUID, actor_id: uuid.UUID) -> None:
        header = await self.session.get(DprHeader, header_id)
        if header is None:
            raise NotFoundError(f"DPR {header_id} not found.")
        if header.status != DprStatus.DRAFT:
            raise PermissionDeniedError("Only DRAFT DPRs can be deleted.")
        before = serialize_model(header)
        await self.session.delete(header)
        await self.audit.record(
            entity_type="DPR_HEADER",
            entity_id=header_id,
            action=AuditAction.DELETE,
            actor_id=actor_id,
            before=before,
        )
        await self.session.commit()


class DprProductionService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.production_repo = DprProductionRepository(session)
        self.boq_repo = BoqRepository(session)
        self.section_repo = BoqSectionRepository(session)
        self.dpr_repo = DprRepository(session)
        self.measurement_repo = MeasurementRepository(session)
        self.audit = AuditService(session)

    async def sync_from_measurements(
        self, project_id: uuid.UUID, boq_item_id: uuid.UUID, measurement_date: date, actor_id: uuid.UUID
    ) -> None:
        """Keeps the day's DPR production entry for this BOQ item in sync
        with the live sum of all non-rejected measurements recorded against
        it on this date, so DPR never needs separate manual re-entry of a
        quantity already captured by a Measurement. Auto-creates a DRAFT
        DPR header for the date if none exists yet. No-ops once the header
        is no longer DRAFT (submitted/locked DPRs are immutable) or marked
        as a no-work day."""
        qty = await self.measurement_repo.sum_computed_qty_for_item_date(boq_item_id, measurement_date)

        header = await self.dpr_repo.get_by_project_and_date(project_id, measurement_date)
        if header is None:
            if qty == 0:
                return
            header = DprHeader(
                project_id=project_id,
                report_date=measurement_date,
                submitted_by=actor_id,
                status=DprStatus.DRAFT,
            )
            self.session.add(header)
            await self.session.flush()
        elif header.status != DprStatus.DRAFT or header.no_work:
            return

        existing = await self.production_repo.get_by_header_and_boq(header.id, boq_item_id)
        if qty == 0:
            if existing is not None:
                await self.session.delete(existing)
                await self.session.commit()
            return

        boq_item = await self.boq_repo.get(boq_item_id)
        if boq_item is None:
            return
        amount = (qty * boq_item.rate).quantize(Decimal("0.01"))

        if existing is not None:
            existing.qty_today = qty
            existing.amount_today = amount
        else:
            self.session.add(
                DprProductionEntry(
                    dpr_header_id=header.id, boq_item_id=boq_item_id, qty_today=qty, amount_today=amount
                )
            )
        await self.session.commit()

    async def bulk_upsert(
        self, header_id: uuid.UUID, data: DprProductionBulkUpsert, actor_id: uuid.UUID
    ) -> list[DprProductionEntry]:
        header = await self.session.get(DprHeader, header_id)
        if header is None:
            raise NotFoundError(f"DPR {header_id} not found.")
        if header.status != DprStatus.DRAFT:
            raise PermissionDeniedError("Cannot edit production entries on a submitted DPR.")
        if header.no_work and any(e.qty_today != Decimal(0) for e in data.entries):
            raise DomainError("Cannot add production entries on a no-work day.")

        if data.daily_work_summary is not None:
            header.daily_work_summary = data.daily_work_summary

        existing_entries = await self.production_repo.list_for_header(header_id)
        existing_by_boq: dict[uuid.UUID, DprProductionEntry] = {e.boq_item_id: e for e in existing_entries}

        boq_items = await self.boq_repo.list_for_project(header.project_id)
        boq_by_id = {b.id: b for b in boq_items}

        results: list[DprProductionEntry] = []

        for entry_data in data.entries:
            boq_item = boq_by_id.get(entry_data.boq_item_id)
            if boq_item is None:
                raise NotFoundError(f"BOQ item {entry_data.boq_item_id} not found in this project.")

            existing = existing_by_boq.get(entry_data.boq_item_id)

            if entry_data.qty_today == Decimal(0):
                if existing is not None:
                    before = serialize_model(existing)
                    entity_id = existing.id
                    await self.session.delete(existing)
                    await self.audit.record(
                        entity_type="DPR_PRODUCTION_ENTRY",
                        entity_id=entity_id,
                        action=AuditAction.DELETE,
                        actor_id=actor_id,
                        before=before,
                    )
                continue

            amount = (entry_data.qty_today * boq_item.rate).quantize(Decimal("0.01"))

            if existing is not None:
                before = serialize_model(existing)
                existing.qty_today = entry_data.qty_today
                existing.amount_today = amount
                existing.chainage = entry_data.chainage
                existing.remarks = entry_data.remarks
                await self.session.flush()
                await self.audit.record(
                    entity_type="DPR_PRODUCTION_ENTRY",
                    entity_id=existing.id,
                    action=AuditAction.UPDATE,
                    actor_id=actor_id,
                    before=before,
                    after=serialize_model(existing),
                )
                results.append(existing)
            else:
                new_entry = DprProductionEntry(
                    dpr_header_id=header_id,
                    boq_item_id=entry_data.boq_item_id,
                    qty_today=entry_data.qty_today,
                    amount_today=amount,
                    chainage=entry_data.chainage,
                    remarks=entry_data.remarks,
                )
                self.session.add(new_entry)
                await self.session.flush()
                await self.audit.record(
                    entity_type="DPR_PRODUCTION_ENTRY",
                    entity_id=new_entry.id,
                    action=AuditAction.CREATE,
                    actor_id=actor_id,
                    after=serialize_model(new_entry),
                )
                results.append(new_entry)

        await self.session.commit()
        for r in results:
            await self.session.refresh(r)
        return results

    async def list_for_header(self, header_id: uuid.UUID) -> list[DprProductionEntry]:
        return await self.production_repo.list_for_header(header_id)

    async def get_progress(self, project_id: uuid.UUID, as_of_date: date) -> ProductionProgressRead:
        sections = await self.section_repo.list_for_project(project_id)
        boq_items = await self.boq_repo.list_for_project(project_id)
        cumulative = await self.production_repo.cumulative_by_project(project_id, as_of_date)

        uom_ids = {b.uom_id for b in boq_items}
        uom_map: dict[uuid.UUID, str] = {}
        for uid in uom_ids:
            uom = await self.session.get(UomMaster, uid)
            if uom is not None:
                uom_map[uid] = uom.code

        items_by_section: dict[uuid.UUID | None, list] = {}
        for item in boq_items:
            items_by_section.setdefault(item.section_id, []).append(item)

        sections_progress: list[SectionProgressRead] = []
        total_agreed = Decimal(0)
        total_executed = Decimal(0)

        for section in sections:
            section_items = items_by_section.get(section.id, [])
            item_reads: list[BoqItemProgressRead] = []
            sec_agreed = Decimal(0)
            sec_executed = Decimal(0)

            for item in section_items:
                agreed_qty = item.tendered_qty
                agreed_amount = (agreed_qty * item.rate).quantize(Decimal("0.01"))
                exec_qty, exec_amount = cumulative.get(item.id, (Decimal(0), Decimal(0)))
                exec_qty = Decimal(str(exec_qty)).quantize(Decimal("0.001"))
                exec_amount = Decimal(str(exec_amount)).quantize(Decimal("0.01"))
                remaining = agreed_qty - exec_qty
                pct = (exec_qty / agreed_qty * 100).quantize(Decimal("0.01")) if agreed_qty != 0 else None

                item_reads.append(
                    BoqItemProgressRead(
                        boq_item_id=item.id,
                        section_id=item.section_id,
                        section_no=section.section_no,
                        section_name=section.section_name,
                        item_no=item.item_no,
                        description=item.description,
                        unit=uom_map.get(item.uom_id, ""),
                        rate=item.rate,
                        agreed_qty=agreed_qty,
                        executed_qty=exec_qty,
                        executed_amount=exec_amount,
                        remaining_qty=remaining,
                        percent_complete=pct,
                    )
                )
                sec_agreed += agreed_amount
                sec_executed += exec_amount

            sections_progress.append(
                SectionProgressRead(
                    section_id=section.id,
                    section_no=section.section_no,
                    section_name=section.section_name,
                    items=item_reads,
                    section_agreed_amount=sec_agreed,
                    section_executed_amount=sec_executed,
                )
            )
            total_agreed += sec_agreed
            total_executed += sec_executed

        unsectioned = items_by_section.get(None, [])
        if unsectioned:
            item_reads = []
            sec_agreed = Decimal(0)
            sec_executed = Decimal(0)
            for item in unsectioned:
                agreed_qty = item.tendered_qty
                agreed_amount = (agreed_qty * item.rate).quantize(Decimal("0.01"))
                exec_qty, exec_amount = cumulative.get(item.id, (Decimal(0), Decimal(0)))
                exec_qty = Decimal(str(exec_qty)).quantize(Decimal("0.001"))
                exec_amount = Decimal(str(exec_amount)).quantize(Decimal("0.01"))
                remaining = agreed_qty - exec_qty
                pct = (exec_qty / agreed_qty * 100).quantize(Decimal("0.01")) if agreed_qty != 0 else None
                item_reads.append(
                    BoqItemProgressRead(
                        boq_item_id=item.id,
                        section_id=None,
                        section_no=None,
                        section_name=None,
                        item_no=item.item_no,
                        description=item.description,
                        unit=uom_map.get(item.uom_id, ""),
                        rate=item.rate,
                        agreed_qty=agreed_qty,
                        executed_qty=exec_qty,
                        executed_amount=exec_amount,
                        remaining_qty=remaining,
                        percent_complete=pct,
                    )
                )
                sec_agreed += agreed_amount
                sec_executed += exec_amount
            sections_progress.append(
                SectionProgressRead(
                    section_id=None,
                    section_no=None,
                    section_name="Uncategorized",
                    items=item_reads,
                    section_agreed_amount=sec_agreed,
                    section_executed_amount=sec_executed,
                )
            )
            total_agreed += sec_agreed
            total_executed += sec_executed

        return ProductionProgressRead(
            as_of_date=as_of_date,
            sections=sections_progress,
            total_agreed_amount=total_agreed,
            total_executed_amount=total_executed,
        )

    async def get_monthly_report(self, project_id: uuid.UUID, month: str) -> DprMonthlyReportRead:
        year_str, month_str = month.split("-")
        year, month_num = int(year_str), int(month_str)
        days_in_month = calendar.monthrange(year, month_num)[1]
        month_start = date(year, month_num, 1)
        month_end = date(year, month_num, days_in_month)
        opening_as_of = month_start - timedelta(days=1)

        sections = await self.section_repo.list_for_project(project_id)
        boq_items = await self.boq_repo.list_for_project(project_id)
        opening_cumulative = await self.production_repo.cumulative_by_project(project_id, opening_as_of)
        closing_cumulative = await self.production_repo.cumulative_by_project(project_id, month_end)
        daily_entries = await self.production_repo.daily_by_project(project_id, month_start, month_end)

        uom_ids = {b.uom_id for b in boq_items}
        uom_map: dict[uuid.UUID, str] = {}
        for uid in uom_ids:
            uom = await self.session.get(UomMaster, uid)
            if uom is not None:
                uom_map[uid] = uom.code

        items_by_section: dict[uuid.UUID | None, list] = {}
        for item in boq_items:
            items_by_section.setdefault(item.section_id, []).append(item)

        def build_item_read(item) -> DprReportItemRead:
            opening_qty, opening_amount = opening_cumulative.get(item.id, (Decimal(0), Decimal(0)))
            closing_qty, closing_amount = closing_cumulative.get(item.id, (Decimal(0), Decimal(0)))
            daily_cells: list[DailyProductionCell] = []
            for day_num in range(1, days_in_month + 1):
                day_date = date(year, month_num, day_num)
                qty, amount = daily_entries.get((item.id, day_date), (Decimal(0), Decimal(0)))
                daily_cells.append(
                    DailyProductionCell(
                        day=day_num,
                        qty=Decimal(str(qty)).quantize(Decimal("0.001")),
                        amount=Decimal(str(amount)).quantize(Decimal("0.01")),
                    )
                )
            return DprReportItemRead(
                boq_item_id=item.id,
                item_no=item.item_no,
                description=item.description,
                unit=uom_map.get(item.uom_id, ""),
                rate=item.rate,
                agreed_qty=item.tendered_qty,
                opening_qty=Decimal(str(opening_qty)).quantize(Decimal("0.001")),
                opening_amount=Decimal(str(opening_amount)).quantize(Decimal("0.01")),
                daily=daily_cells,
                closing_qty=Decimal(str(closing_qty)).quantize(Decimal("0.001")),
                closing_amount=Decimal(str(closing_amount)).quantize(Decimal("0.01")),
            )

        report_sections: list[DprReportSectionRead] = []
        total_agreed = Decimal(0)
        total_closing = Decimal(0)

        for section in sections:
            section_items = items_by_section.get(section.id, [])
            item_reads = [build_item_read(item) for item in section_items]
            sec_agreed = sum((i.agreed_qty * i.rate for i in item_reads), Decimal(0)).quantize(Decimal("0.01"))
            sec_closing = sum((i.closing_amount for i in item_reads), Decimal(0))
            report_sections.append(
                DprReportSectionRead(
                    section_id=section.id,
                    section_no=section.section_no,
                    section_name=section.section_name,
                    items=item_reads,
                    section_agreed_amount=sec_agreed,
                    section_closing_amount=sec_closing,
                )
            )
            total_agreed += sec_agreed
            total_closing += sec_closing

        unsectioned = items_by_section.get(None, [])
        if unsectioned:
            item_reads = [build_item_read(item) for item in unsectioned]
            sec_agreed = sum((i.agreed_qty * i.rate for i in item_reads), Decimal(0)).quantize(Decimal("0.01"))
            sec_closing = sum((i.closing_amount for i in item_reads), Decimal(0))
            report_sections.append(
                DprReportSectionRead(
                    section_id=None,
                    section_no=None,
                    section_name="Uncategorized",
                    items=item_reads,
                    section_agreed_amount=sec_agreed,
                    section_closing_amount=sec_closing,
                )
            )
            total_agreed += sec_agreed
            total_closing += sec_closing

        return DprMonthlyReportRead(
            project_id=project_id,
            month=month,
            days_in_month=days_in_month,
            sections=report_sections,
            total_agreed_amount=total_agreed,
            total_closing_amount=total_closing,
        )
