import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import delete, select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import DomainError, NotFoundError, PermissionDeniedError
from app.domain.dpr.locking import LOCK_BYPASS_ROLES
from app.domain.measurement.calculators import calculate_quantity
from app.domain.measurement.expression import evaluate_expression
from app.domain.measurement.validators import BoqItemSnapshot, validate_measurement_against_boq
from app.models.audit import AuditAction
from app.models.boq_construction_template import BoqConstructionTemplate
from app.models.dpr import DprHeader, DprMaterial
from app.models.master_data import MaterialMaster, UomMaster, WorkTypeMaster
from app.models.measurement import Measurement
from app.models.measurement_steel_line import MeasurementSteelLine
from app.models.user import UserRole
from app.repositories.boq_repo import BoqRepository
from app.repositories.measurement_repo import MeasurementRepository
from app.schemas.measurement import AutoMaterialRead, MeasurementCreate, MeasurementUpdate
from app.services.audit_service import AuditService, serialize_model
from app.services.dpr_service import DprProductionService
from app.services.material_template_service import (
    BITUMINOUS_TYPES,
    MaterialTemplateResult,
    MaterialTemplateService,
)
from app.services.organization_settings_service import OrganizationSettingsService


class MeasurementService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = MeasurementRepository(session)
        self.boq_repo = BoqRepository(session)
        self.settings_service = OrganizationSettingsService(session)
        self.production_service = DprProductionService(session)
        self.audit = AuditService(session)

    async def _get_work_type(self, work_type_id: uuid.UUID) -> WorkTypeMaster:
        work_type = await self.session.get(WorkTypeMaster, work_type_id)
        if work_type is None:
            raise NotFoundError(f"Work type {work_type_id} not found.")
        return work_type

    @staticmethod
    def _resolve_dimensions(
        dimensions: dict[str, Decimal], dimension_expressions: dict[str, str] | None
    ) -> dict[str, Decimal]:
        """Re-evaluates any l/b/d fields that were entered as an expression
        server-side — the client's own computed decimal for those keys is
        never trusted, only the expression text is (schema already rejects
        expression keys outside l/b/d)."""
        if not dimension_expressions:
            return dimensions
        resolved = dict(dimensions)
        for field, expr in dimension_expressions.items():
            resolved[field] = evaluate_expression(expr)
        return resolved

    async def _get_dpr_header_status(self, project_id: uuid.UUID, measurement_date: date) -> str | None:
        # Measurements have no direct FK to dpr_headers — the relationship is
        # by project + date, same lookup pattern _sync_auto_materials uses.
        result = await self.session.execute(
            sa_select(DprHeader.status).where(
                DprHeader.project_id == project_id,
                DprHeader.report_date == measurement_date,
            )
        )
        return result.scalar_one_or_none()

    async def _authorize_create(self, project_id: uuid.UUID, measurement_date: date, actor_role: UserRole) -> bool:
        """Returns True for a PM/Admin bypass create on an already-submitted
        DPR (stamp edited_by/edited_at). Raises if new measurements aren't
        allowed at all."""
        status = await self._get_dpr_header_status(project_id, measurement_date)
        if status is not None and status != "DRAFT":
            if actor_role not in LOCK_BYPASS_ROLES:
                raise PermissionDeniedError(
                    "This DPR has been submitted — only a Project Manager or Admin can add measurements now."
                )
            return True
        return False

    async def _authorize_measurement_edit(
        self, measurement: Measurement, actor_id: uuid.UUID, actor_role: UserRole
    ) -> bool:
        """Returns True for a PM/Admin bypass edit on an already-submitted
        DPR (stamp edited_by/edited_at). While the DPR is still DRAFT (or
        doesn't exist yet), the normal "only the recording engineer or an
        Admin" ownership rule applies unchanged. Once submitted, ownership
        stops mattering — only PM/Admin may touch it at all, recorder
        included."""
        status = await self._get_dpr_header_status(measurement.project_id, measurement.measurement_date)
        if status is not None and status != "DRAFT":
            if actor_role not in LOCK_BYPASS_ROLES:
                raise PermissionDeniedError(
                    "This DPR has been submitted — only a Project Manager or Admin can edit entries now."
                )
            return True
        if measurement.recorded_by != actor_id and actor_role != UserRole.ADMIN:
            raise PermissionDeniedError("Only the recording engineer can edit this measurement.")
        return False

    async def _load_and_validate_template(
        self, template_id: uuid.UUID | None, construction_type: str
    ) -> BoqConstructionTemplate | None:
        if construction_type == "GENERAL":
            return None
        if template_id is None:
            raise DomainError(
                f"A construction template is required for {construction_type} measurements. "
                "Add one in Settings → Construction Templates."
            )
        template = await self.session.get(BoqConstructionTemplate, template_id)
        if template is None:
            raise DomainError("The selected construction template does not exist.")
        if not template.is_active:
            raise DomainError(f"Template '{template.name}' is inactive. Select an active template.")
        if template.construction_type != construction_type:
            raise DomainError(
                f"Template type mismatch: selected template is for {template.construction_type}, "
                f"but this BOQ item is {construction_type}."
            )
        if not template.items:
            raise DomainError(
                f"Template '{template.name}' has no items configured. "
                "Add materials to the template first."
            )
        return template

    async def create(self, data: MeasurementCreate, recorded_by: uuid.UUID, actor_role: UserRole) -> Measurement:
        is_bypass_edit = await self._authorize_create(data.project_id, data.measurement_date, actor_role)
        boq_item = await self.boq_repo.get(data.boq_item_id)
        if boq_item is None or boq_item.project_id != data.project_id:
            raise NotFoundError("BOQ item not found for this project.")

        construction_type = boq_item.construction_type
        org_settings = await self.settings_service.get()
        template_svc = MaterialTemplateService(self.session)

        template = await self._load_and_validate_template(data.boq_template_id, construction_type)

        resolved_dimensions = data.dimensions
        if construction_type == "STEEL":
            if not data.steel_lines:
                raise DomainError("Steel measurements require at least one bar entry.")
            coeff_map = template_svc.build_steel_coeff_map(template)
            computed_qty = Decimal("0")
            for line in data.steel_lines:
                t_item = coeff_map.get(line.diameter_mm)
                if t_item is None:
                    raise DomainError(
                        f"No item configured for {line.diameter_mm}mm in template '{template.name}'. "
                        "Add it in Settings → Construction Templates."
                    )
                computed_qty += MaterialTemplateService.line_weight(
                    line.bar_count, line.length_m, t_item.coefficient
                )
            computed_qty = computed_qty.quantize(Decimal("0.001"))
        else:
            coeff_map = {}
            work_type = await self._get_work_type(boq_item.work_type_id)
            if not data.dimensions:
                raise DomainError("Dimensions are required.")
            resolved_dimensions = self._resolve_dimensions(data.dimensions, data.dimension_expressions)
            computed_qty = calculate_quantity(
                work_type.formula, work_type.dimension_fields, resolved_dimensions
            ).quantize(Decimal("0.001"))

        snapshot = BoqItemSnapshot(
            tendered_qty=boq_item.tendered_qty,
            consumed_qty=boq_item.consumed_qty,
            has_active_variation_order=boq_item.has_active_variation_order,
        )
        validate_measurement_against_boq(
            computed_qty, snapshot, tolerance_pct=org_settings.default_measurement_tolerance_percent
        )

        from app.services.boq_service import BoqService
        effective_rate = await BoqService(self.session).get_effective_rate(
            data.boq_item_id, data.measurement_date
        )
        measurement = Measurement(
            project_id=data.project_id,
            boq_item_id=data.boq_item_id,
            work_type_id=boq_item.work_type_id,
            measurement_date=data.measurement_date,
            dimensions={k: str(v) for k, v in resolved_dimensions.items()} if resolved_dimensions else {},
            dimension_expressions=data.dimension_expressions,
            computed_qty=computed_qty,
            status="DRAFT",
            recorded_by=recorded_by,
            chainage=data.chainage,
            rate=data.rate if data.rate is not None else effective_rate,
            boq_template_id=template.id if template else None,
            boq_template_name=template.name if template else None,
            notes=data.notes,
            edited_by=recorded_by if is_bypass_edit else None,
            edited_at=datetime.now(timezone.utc) if is_bypass_edit else None,
        )
        self.repo.add(measurement)
        await self.session.flush()

        if construction_type == "STEEL":
            for line in data.steel_lines:
                t_item = coeff_map.get(line.diameter_mm)
                if t_item is None:
                    continue
                weight = MaterialTemplateService.line_weight(
                    line.bar_count, line.length_m, t_item.coefficient
                )
                self.session.add(MeasurementSteelLine(
                    measurement_id=measurement.id,
                    description=line.description,
                    diameter_mm=line.diameter_mm,
                    bar_count=line.bar_count,
                    length_m=line.length_m,
                    coefficient=t_item.coefficient,
                    computed_weight_mt=weight,
                ))

        await self.audit.record(
            entity_type="MEASUREMENT",
            entity_id=measurement.id,
            action=AuditAction.CREATE,
            actor_id=recorded_by,
            after=serialize_model(measurement),
        )
        await self.session.commit()
        await self.session.refresh(measurement)

        await self._sync_auto_materials(measurement, construction_type, org_settings.steel_measurement_uom)

        await self.production_service.sync_from_measurements(
            measurement.project_id, measurement.boq_item_id, measurement.measurement_date, recorded_by
        )
        return measurement

    async def list_for_project(self, project_id: uuid.UUID) -> list[Measurement]:
        return await self.repo.list_for_project(project_id)

    async def get_auto_materials_map(
        self, measurement_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, list[AutoMaterialRead]]:
        """Materials auto-populated on dpr_materials from a construction
        template (source_measurement_id set) — batched per measurement id
        so callers rendering a list don't N+1 this."""
        if not measurement_ids:
            return {}
        result = await self.session.execute(
            sa_select(DprMaterial, MaterialMaster, UomMaster)
            .join(MaterialMaster, DprMaterial.material_id == MaterialMaster.id)
            .join(UomMaster, DprMaterial.uom_id == UomMaster.id)
            .where(DprMaterial.source_measurement_id.in_(measurement_ids))
        )
        out: dict[uuid.UUID, list[AutoMaterialRead]] = {}
        for dpr_material, material, uom in result.all():
            out.setdefault(dpr_material.source_measurement_id, []).append(
                AutoMaterialRead(
                    material_id=material.id,
                    material_code=material.code,
                    material_name=material.name,
                    computed_qty=dpr_material.qty_consumed,
                    uom_code=uom.code,
                    rate=dpr_material.rate,
                    manually_edited=dpr_material.manually_edited,
                )
            )
        return out

    async def get(self, measurement_id: uuid.UUID) -> Measurement:
        measurement = await self.repo.get(measurement_id)
        if measurement is None:
            raise NotFoundError(f"Measurement {measurement_id} not found.")
        return measurement

    async def update(
        self, measurement_id: uuid.UUID, data: MeasurementUpdate, actor_id: uuid.UUID, actor_role: UserRole
    ) -> Measurement:
        measurement = await self.get(measurement_id)
        is_bypass_edit = await self._authorize_measurement_edit(measurement, actor_id, actor_role)

        # The line can be re-pointed at a different BOQ item; when it is, the
        # work type (and thus dimension fields / construction type) comes from
        # the *target* item, and the old item's production tally must be
        # re-synced afterwards so its progress drops by this line's quantity.
        old_boq_item_id = measurement.boq_item_id
        old_template_id = measurement.boq_template_id
        target_boq_item_id = data.boq_item_id or measurement.boq_item_id
        boq_item = await self.boq_repo.get(target_boq_item_id)
        if boq_item is None or boq_item.project_id != measurement.project_id:
            raise NotFoundError("BOQ item not found for this project.")
        boq_item_changed = boq_item.id != old_boq_item_id

        construction_type = boq_item.construction_type
        org_settings = await self.settings_service.get()
        template_svc = MaterialTemplateService(self.session)

        template_id = data.boq_template_id if data.boq_template_id is not None else measurement.boq_template_id
        template = await self._load_and_validate_template(template_id, construction_type)

        resolved_dimensions = data.dimensions
        if construction_type == "STEEL":
            if not data.steel_lines:
                raise DomainError("Steel measurements require at least one bar entry.")
            coeff_map = template_svc.build_steel_coeff_map(template)
            computed_qty = Decimal("0")
            for line in data.steel_lines:
                t_item = coeff_map.get(line.diameter_mm)
                if t_item is None:
                    raise DomainError(
                        f"No item configured for {line.diameter_mm}mm in template '{template.name}'. "
                        "Add it in Settings → Construction Templates."
                    )
                computed_qty += MaterialTemplateService.line_weight(
                    line.bar_count, line.length_m, t_item.coefficient
                )
            computed_qty = computed_qty.quantize(Decimal("0.001"))
        else:
            coeff_map = {}
            work_type = await self._get_work_type(boq_item.work_type_id)
            if not data.dimensions:
                raise DomainError("Dimensions are required.")
            resolved_dimensions = self._resolve_dimensions(data.dimensions, data.dimension_expressions)
            computed_qty = calculate_quantity(
                work_type.formula, work_type.dimension_fields, resolved_dimensions
            ).quantize(Decimal("0.001"))

        snapshot = BoqItemSnapshot(
            tendered_qty=boq_item.tendered_qty,
            consumed_qty=boq_item.consumed_qty,
            has_active_variation_order=boq_item.has_active_variation_order,
        )
        validate_measurement_against_boq(
            computed_qty, snapshot, tolerance_pct=org_settings.default_measurement_tolerance_percent
        )

        before = serialize_model(measurement)
        measurement.boq_item_id = boq_item.id
        measurement.work_type_id = boq_item.work_type_id
        measurement.dimensions = {k: str(v) for k, v in resolved_dimensions.items()} if resolved_dimensions else {}
        measurement.dimension_expressions = data.dimension_expressions
        measurement.computed_qty = computed_qty
        measurement.chainage = data.chainage
        measurement.boq_template_id = template.id if template else None
        measurement.boq_template_name = template.name if template else None
        if data.rate is not None:
            measurement.rate = data.rate
        if is_bypass_edit:
            measurement.edited_by = actor_id
            measurement.edited_at = datetime.now(timezone.utc)

        if construction_type == "STEEL":
            await self.session.execute(
                delete(MeasurementSteelLine).where(MeasurementSteelLine.measurement_id == measurement.id)
            )
            for line in data.steel_lines:
                t_item = coeff_map.get(line.diameter_mm)
                if t_item is None:
                    continue
                weight = MaterialTemplateService.line_weight(
                    line.bar_count, line.length_m, t_item.coefficient
                )
                self.session.add(MeasurementSteelLine(
                    measurement_id=measurement.id,
                    description=line.description,
                    diameter_mm=line.diameter_mm,
                    bar_count=line.bar_count,
                    length_m=line.length_m,
                    coefficient=t_item.coefficient,
                    computed_weight_mt=weight,
                ))

        await self.session.flush()
        await self.audit.record(
            entity_type="MEASUREMENT",
            entity_id=measurement.id,
            action=AuditAction.UPDATE,
            actor_id=actor_id,
            before=before,
            after=serialize_model(measurement),
        )
        await self.session.commit()
        await self.session.refresh(measurement)

        # A template swap or a move to a different (template-driven) BOQ item
        # invalidates the previously auto-added materials wholesale — including
        # any whose cost was manually tweaked, since those edits belonged to the
        # old template. Force a full wipe-and-regenerate in that case; a plain
        # dimensions edit still preserves manual cost overrides.
        template_or_item_changed = boq_item_changed or old_template_id != (template.id if template else None)
        await self._sync_auto_materials(
            measurement, construction_type, org_settings.steel_measurement_uom,
            reset_all=template_or_item_changed,
        )

        await self.production_service.sync_from_measurements(
            measurement.project_id, measurement.boq_item_id, measurement.measurement_date, actor_id
        )
        # When the line moved to a different BOQ item, the old item's daily
        # production must be recomputed too so its progress no longer counts
        # this measurement's quantity.
        if boq_item_changed:
            await self.production_service.sync_from_measurements(
                measurement.project_id, old_boq_item_id, measurement.measurement_date, actor_id
            )
        return measurement

    async def update_notes(
        self, measurement_id: uuid.UUID, notes: str | None, actor_id: uuid.UUID, actor_role: UserRole
    ) -> Measurement:
        """Standalone notes edit — does not touch dimensions/computed_qty/
        steel_lines, so it works regardless of measurement status and
        doesn't require resending the full measurement payload."""
        measurement = await self.get(measurement_id)
        is_bypass_edit = await self._authorize_measurement_edit(measurement, actor_id, actor_role)

        before = serialize_model(measurement)
        measurement.notes = notes
        if is_bypass_edit:
            measurement.edited_by = actor_id
            measurement.edited_at = datetime.now(timezone.utc)
        await self.session.flush()
        await self.audit.record(
            entity_type="MEASUREMENT",
            entity_id=measurement.id,
            action=AuditAction.UPDATE,
            actor_id=actor_id,
            before=before,
            after=serialize_model(measurement),
        )
        await self.session.commit()
        await self.session.refresh(measurement)
        return measurement

    async def delete(
        self, measurement_id: uuid.UUID, actor_id: uuid.UUID, actor_role: UserRole
    ) -> None:
        measurement = await self.get(measurement_id)
        await self._authorize_measurement_edit(measurement, actor_id, actor_role)

        project_id = measurement.project_id
        boq_item_id = measurement.boq_item_id
        measurement_date = measurement.measurement_date
        entity_id = measurement.id
        before = serialize_model(measurement)

        await self.session.execute(
            delete(DprMaterial).where(
                DprMaterial.source_measurement_id == measurement_id,
                DprMaterial.manually_edited.is_(False),
            )
        )

        await self.session.delete(measurement)
        await self.audit.record(
            entity_type="MEASUREMENT",
            entity_id=entity_id,
            action=AuditAction.DELETE,
            actor_id=actor_id,
            before=before,
        )
        await self.session.commit()

        await self.production_service.sync_from_measurements(
            project_id, boq_item_id, measurement_date, actor_id
        )

    async def _sync_auto_materials(
        self, measurement: Measurement, construction_type: str, steel_uom: str, reset_all: bool = False
    ) -> None:
        # Normally only the untouched auto rows are cleared so manual cost/qty
        # overrides survive a dimensions edit. When the template or BOQ item
        # itself changed (reset_all), every auto row for this measurement goes,
        # manual edits included, because they no longer describe the new item.
        delete_stmt = delete(DprMaterial).where(DprMaterial.source_measurement_id == measurement.id)
        if not reset_all:
            delete_stmt = delete_stmt.where(DprMaterial.manually_edited.is_(False))
        await self.session.execute(delete_stmt)
        if construction_type == "GENERAL" or measurement.boq_template_id is None:
            await self.session.commit()
            return

        header_row = await self.session.execute(
            sa_select(DprHeader.id).where(
                DprHeader.project_id == measurement.project_id,
                DprHeader.report_date == measurement.measurement_date,
            )
        )
        dpr_header_id = header_row.scalar_one_or_none()
        if dpr_header_id is None:
            await self.session.commit()
            return

        svc = MaterialTemplateService(self.session)
        materials: list[MaterialTemplateResult] = []

        if construction_type == "STEEL":
            lines_row = await self.session.execute(
                sa_select(MeasurementSteelLine).where(
                    MeasurementSteelLine.measurement_id == measurement.id
                )
            )
            steel_lines = lines_row.scalars().all()
            materials = await svc.compute_materials(
                measurement.boq_template_id, Decimal("0"), steel_lines=steel_lines, steel_uom=steel_uom
            )
        else:
            materials = await svc.compute_materials(
                measurement.boq_template_id, measurement.computed_qty
            )

        for m in materials:
            if m.computed_qty <= 0:
                continue
            self.session.add(DprMaterial(
                dpr_header_id=dpr_header_id,
                material_id=m.material_id,
                qty_consumed=m.computed_qty,
                uom_id=m.uom_id,
                rate=m.rate,
                source_measurement_id=measurement.id,
                manually_edited=False,
            ))
        await self.session.commit()
