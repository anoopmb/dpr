import uuid
from decimal import Decimal

from sqlalchemy import delete, select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import DomainError, NotFoundError, PermissionDeniedError
from app.domain.measurement.calculators import calculate_quantity
from app.domain.measurement.validators import BoqItemSnapshot, validate_measurement_against_boq
from app.models.audit import AuditAction
from app.models.boq_construction_template import BoqConstructionTemplate
from app.models.dpr import DprHeader, DprMaterial
from app.models.master_data import WorkTypeMaster
from app.models.measurement import Measurement
from app.models.measurement_steel_line import MeasurementSteelLine
from app.models.user import UserRole
from app.repositories.boq_repo import BoqRepository
from app.repositories.measurement_repo import MeasurementRepository
from app.schemas.measurement import MeasurementCreate, MeasurementUpdate
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

    async def create(self, data: MeasurementCreate, recorded_by: uuid.UUID) -> Measurement:
        boq_item = await self.boq_repo.get(data.boq_item_id)
        if boq_item is None or boq_item.project_id != data.project_id:
            raise NotFoundError("BOQ item not found for this project.")

        construction_type = boq_item.construction_type
        org_settings = await self.settings_service.get()
        template_svc = MaterialTemplateService(self.session)

        template = await self._load_and_validate_template(data.boq_template_id, construction_type)

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
            computed_qty = calculate_quantity(
                work_type.formula, work_type.dimension_fields, data.dimensions
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
            dimensions={k: str(v) for k, v in data.dimensions.items()} if data.dimensions else {},
            computed_qty=computed_qty,
            status="DRAFT",
            recorded_by=recorded_by,
            chainage=data.chainage,
            rate=data.rate if data.rate is not None else effective_rate,
            boq_template_id=template.id if template else None,
            boq_template_name=template.name if template else None,
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

    async def get(self, measurement_id: uuid.UUID) -> Measurement:
        measurement = await self.repo.get(measurement_id)
        if measurement is None:
            raise NotFoundError(f"Measurement {measurement_id} not found.")
        return measurement

    async def update(
        self, measurement_id: uuid.UUID, data: MeasurementUpdate, actor_id: uuid.UUID, actor_role: UserRole
    ) -> Measurement:
        measurement = await self.get(measurement_id)
        if measurement.recorded_by != actor_id and actor_role != UserRole.ADMIN:
            raise PermissionDeniedError("Only the recording engineer can edit this measurement.")

        boq_item = await self.boq_repo.get(measurement.boq_item_id)
        if boq_item is None:
            raise NotFoundError("BOQ item for this measurement no longer exists.")

        construction_type = boq_item.construction_type
        org_settings = await self.settings_service.get()
        template_svc = MaterialTemplateService(self.session)

        template_id = data.boq_template_id if data.boq_template_id is not None else measurement.boq_template_id
        template = await self._load_and_validate_template(template_id, construction_type)

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
            work_type = await self._get_work_type(measurement.work_type_id)
            if not data.dimensions:
                raise DomainError("Dimensions are required.")
            computed_qty = calculate_quantity(
                work_type.formula, work_type.dimension_fields, data.dimensions
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
        measurement.dimensions = {k: str(v) for k, v in data.dimensions.items()} if data.dimensions else {}
        measurement.computed_qty = computed_qty
        measurement.chainage = data.chainage
        measurement.boq_template_id = template.id if template else None
        measurement.boq_template_name = template.name if template else None
        if data.rate is not None:
            measurement.rate = data.rate

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

        await self._sync_auto_materials(measurement, construction_type, org_settings.steel_measurement_uom)

        await self.production_service.sync_from_measurements(
            measurement.project_id, measurement.boq_item_id, measurement.measurement_date, actor_id
        )
        return measurement

    async def delete(
        self, measurement_id: uuid.UUID, actor_id: uuid.UUID, actor_role: UserRole
    ) -> None:
        measurement = await self.get(measurement_id)
        if measurement.recorded_by != actor_id and actor_role != UserRole.ADMIN:
            raise PermissionDeniedError("Only the recording engineer can delete this measurement.")

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
        self, measurement: Measurement, construction_type: str, steel_uom: str
    ) -> None:
        await self.session.execute(
            delete(DprMaterial).where(
                DprMaterial.source_measurement_id == measurement.id,
                DprMaterial.manually_edited.is_(False),
            )
        )
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
