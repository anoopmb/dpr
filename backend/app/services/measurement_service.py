import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, PermissionDeniedError
from app.domain.measurement.calculators import calculate_quantity
from app.domain.measurement.validators import BoqItemSnapshot, validate_measurement_against_boq
from app.models.audit import AuditAction
from app.models.master_data import WorkTypeMaster
from app.models.measurement import Measurement
from app.models.user import UserRole
from app.repositories.boq_repo import BoqRepository
from app.repositories.measurement_repo import MeasurementRepository
from app.schemas.measurement import MeasurementCreate, MeasurementUpdate
from app.services.audit_service import AuditService, serialize_model
from app.services.dpr_service import DprProductionService
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

    async def create(self, data: MeasurementCreate, recorded_by: uuid.UUID) -> Measurement:
        boq_item = await self.boq_repo.get(data.boq_item_id)
        if boq_item is None or boq_item.project_id != data.project_id:
            raise NotFoundError("BOQ item not found for this project.")

        work_type = await self._get_work_type(boq_item.work_type_id)

        computed_qty: Decimal = calculate_quantity(
            work_type.formula, work_type.dimension_fields, data.dimensions
        ).quantize(Decimal("0.001"))

        snapshot = BoqItemSnapshot(
            tendered_qty=boq_item.tendered_qty,
            consumed_qty=boq_item.consumed_qty,
            has_active_variation_order=boq_item.has_active_variation_order,
        )
        org_settings = await self.settings_service.get()
        validate_measurement_against_boq(
            computed_qty, snapshot, tolerance_pct=org_settings.default_measurement_tolerance_percent
        )

        from app.services.boq_service import BoqService
        effective_rate = await BoqService(self.session).get_effective_rate(data.boq_item_id, data.measurement_date)
        measurement = Measurement(
            project_id=data.project_id,
            boq_item_id=data.boq_item_id,
            work_type_id=boq_item.work_type_id,
            measurement_date=data.measurement_date,
            dimensions={k: str(v) for k, v in data.dimensions.items()},
            computed_qty=computed_qty,
            status='DRAFT',
            recorded_by=recorded_by,
            chainage=data.chainage,
            rate=data.rate if data.rate is not None else effective_rate,
        )
        self.repo.add(measurement)
        await self.session.flush()
        await self.audit.record(
            entity_type="MEASUREMENT",
            entity_id=measurement.id,
            action=AuditAction.CREATE,
            actor_id=recorded_by,
            after=serialize_model(measurement),
        )
        await self.session.commit()
        await self.session.refresh(measurement)

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

        work_type = await self._get_work_type(measurement.work_type_id)
        computed_qty: Decimal = calculate_quantity(
            work_type.formula, work_type.dimension_fields, data.dimensions
        ).quantize(Decimal("0.001"))

        boq_item = await self.boq_repo.get(measurement.boq_item_id)
        if boq_item is None:
            raise NotFoundError("BOQ item for this measurement no longer exists.")
        snapshot = BoqItemSnapshot(
            tendered_qty=boq_item.tendered_qty,
            consumed_qty=boq_item.consumed_qty,
            has_active_variation_order=boq_item.has_active_variation_order,
        )
        org_settings = await self.settings_service.get()
        validate_measurement_against_boq(
            computed_qty, snapshot, tolerance_pct=org_settings.default_measurement_tolerance_percent
        )

        before = serialize_model(measurement)
        measurement.dimensions = {k: str(v) for k, v in data.dimensions.items()}
        measurement.computed_qty = computed_qty
        measurement.chainage = data.chainage
        if data.rate is not None:
            measurement.rate = data.rate
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
