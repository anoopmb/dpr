import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import DomainError, NotFoundError, PermissionDeniedError
from app.domain.measurement.calculators import calculate_quantity
from app.domain.measurement.validators import BoqItemSnapshot, validate_measurement_against_boq
from app.domain.measurement.workflow import DRAFT, LOCKED, REJECTED, SUBMITTED, WorkflowLevel, transition
from app.models.audit import AuditAction
from app.models.master_data import WorkTypeMaster
from app.models.measurement import Measurement, MeasurementApproval
from app.models.user import UserRole
from app.models.workflow_config import WorkflowDefinition, WorkflowEntityType
from app.repositories.boq_repo import BoqRepository
from app.repositories.measurement_repo import MeasurementRepository
from app.schemas.measurement import MeasurementActionRequest, MeasurementCreate, MeasurementUpdate
from app.services.audit_service import AuditService, serialize_model
from app.services.dpr_service import DprProductionService
from app.services.notification_service import NotificationService
from app.services.organization_settings_service import OrganizationSettingsService
from app.services.project_assignment_service import ProjectAssignmentService
from app.services.workflow_config_service import WorkflowConfigService

_MEASUREMENTS_LINK = "/measurements"
_MEASUREMENTS_FIELD_LINK = "/field/my-measurements"


class MeasurementService:
    def __init__(self, session: AsyncSession, background_tasks: BackgroundTasks | None = None) -> None:
        self.session = session
        self.repo = MeasurementRepository(session)
        self.boq_repo = BoqRepository(session)
        self.settings_service = OrganizationSettingsService(session)
        self.notification_service = NotificationService(session, background_tasks)
        self.assignment_service = ProjectAssignmentService(session)
        self.production_service = DprProductionService(session)
        self.workflow_config = WorkflowConfigService(session)
        self.audit = AuditService(session)

    async def _get_work_type(self, work_type_id: uuid.UUID) -> WorkTypeMaster:
        work_type = await self.session.get(WorkTypeMaster, work_type_id)
        if work_type is None:
            raise NotFoundError(f"Work type {work_type_id} not found.")
        return work_type

    async def _get_effective_workflow(self, project_id: uuid.UUID) -> WorkflowDefinition:
        return await self.workflow_config.get_effective_definition(WorkflowEntityType.MEASUREMENT, project_id)

    @staticmethod
    def _to_domain_levels(definition: WorkflowDefinition) -> list[WorkflowLevel]:
        return [WorkflowLevel(status_code=lvl.status_code, allow_reject=lvl.allow_reject) for lvl in definition.levels]

    async def _resolve_users_for_roles(self, project_id: uuid.UUID, role_values: list[str]) -> list[uuid.UUID]:
        ids: set[uuid.UUID] = set()
        for role_value in role_values:
            ids.update(await self.assignment_service.resolve_users_for_role(project_id, UserRole(role_value)))
        return list(ids)

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

        measurement = Measurement(
            project_id=data.project_id,
            boq_item_id=data.boq_item_id,
            work_type_id=boq_item.work_type_id,
            measurement_date=data.measurement_date,
            dimensions={k: str(v) for k, v in data.dimensions.items()},
            computed_qty=computed_qty,
            status=DRAFT,
            recorded_by=recorded_by,
            chainage=data.chainage,
            rate=data.rate if data.rate is not None else boq_item.rate,
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

    async def _record_transition(
        self,
        measurement: Measurement,
        target: str,
        actor_id: uuid.UUID,
        remarks: str | None,
        levels: list[WorkflowLevel],
        force: bool = False,
    ) -> Measurement:
        from_status = measurement.status
        if not force:
            transition(from_status, target, levels)

        before = serialize_model(measurement)

        approval = MeasurementApproval(
            measurement_id=measurement.id,
            from_status=from_status,
            to_status=target,
            acted_by=actor_id,
            remarks=remarks,
            acted_at=datetime.now(timezone.utc),
        )
        self.session.add(approval)
        measurement.status = target
        await self.session.flush()
        after = serialize_model(measurement)
        await self.audit.record(
            entity_type="MEASUREMENT",
            entity_id=measurement.id,
            action=AuditAction.STATUS_CHANGE,
            actor_id=actor_id,
            before=before,
            after=after,
        )
        await self.session.commit()
        await self.session.refresh(measurement)
        return measurement

    async def submit(self, measurement_id: uuid.UUID, actor_id: uuid.UUID, actor_role: UserRole) -> Measurement:
        measurement = await self.get(measurement_id)
        if measurement.recorded_by != actor_id and actor_role != UserRole.ADMIN:
            raise PermissionDeniedError("Only the recording engineer can submit this measurement.")

        definition = await self._get_effective_workflow(measurement.project_id)
        domain_levels = self._to_domain_levels(definition)

        if not definition.approvals_enabled:
            final_level = next((lvl for lvl in definition.levels if lvl.is_final_approval), None)
            if final_level is None:
                raise DomainError(
                    "Approvals are disabled for this project's measurement workflow, but no "
                    "final-approval level is configured to auto-advance to. Configure one in "
                    "Settings › Approval Workflow."
                )
            result = await self._record_transition(
                measurement, final_level.status_code, actor_id, None, domain_levels, force=True
            )
            await self.production_service.sync_from_measurements(
                measurement.project_id, measurement.boq_item_id, measurement.measurement_date, actor_id
            )
            await self.notification_service.notify(
                [measurement.recorded_by],
                type="MEASUREMENT_APPROVED",
                title="Measurement auto-approved",
                message=(
                    f"Your measurement dated {measurement.measurement_date} was auto-approved — "
                    "approvals are disabled for this project."
                ),
                project_id=measurement.project_id,
                link_url=_MEASUREMENTS_FIELD_LINK,
                related_entity_type="MEASUREMENT",
                related_entity_id=measurement.id,
            )
            return result

        result = await self._record_transition(measurement, SUBMITTED, actor_id, None, domain_levels)
        await self.production_service.sync_from_measurements(
            measurement.project_id, measurement.boq_item_id, measurement.measurement_date, actor_id
        )

        if definition.levels:
            first_level = definition.levels[0]
            reviewer_ids = await self._resolve_users_for_roles(measurement.project_id, first_level.allowed_roles)
            await self.notification_service.notify(
                reviewer_ids,
                type="MEASUREMENT_SUBMITTED",
                title="Measurement submitted for approval",
                message=f"A measurement dated {measurement.measurement_date} was submitted for your approval.",
                project_id=measurement.project_id,
                link_url=_MEASUREMENTS_LINK,
                related_entity_type="MEASUREMENT",
                related_entity_id=measurement.id,
            )
        return result

    async def approve(
        self, measurement_id: uuid.UUID, actor_id: uuid.UUID, actor_role: UserRole, data: MeasurementActionRequest
    ) -> Measurement:
        measurement = await self.get(measurement_id)
        current = measurement.status
        definition = await self._get_effective_workflow(measurement.project_id)
        codes = [lvl.status_code for lvl in definition.levels]

        if current == SUBMITTED:
            if not definition.levels:
                raise PermissionDeniedError("No approval levels are configured for this project's measurement workflow.")
            level_index = 0
        elif current in codes and codes.index(current) + 1 < len(definition.levels):
            level_index = codes.index(current) + 1
        else:
            raise PermissionDeniedError(f"Measurement in status {current} is not awaiting approval.")

        level = definition.levels[level_index]
        if actor_role != UserRole.ADMIN and actor_role.value not in level.allowed_roles:
            raise PermissionDeniedError(f"Only {', '.join(level.allowed_roles)} may approve at this level.")

        domain_levels = self._to_domain_levels(definition)
        result = await self._record_transition(measurement, level.status_code, actor_id, data.remarks, domain_levels)
        await self.production_service.sync_from_measurements(
            measurement.project_id, measurement.boq_item_id, measurement.measurement_date, actor_id
        )

        if level.is_final_approval:
            await self.notification_service.notify(
                [measurement.recorded_by],
                type="MEASUREMENT_APPROVED",
                title="Measurement fully approved",
                message=f"Your measurement dated {measurement.measurement_date} has been fully approved.",
                project_id=measurement.project_id,
                link_url=_MEASUREMENTS_FIELD_LINK,
                related_entity_type="MEASUREMENT",
                related_entity_id=measurement.id,
            )
        else:
            next_level = definition.levels[level_index + 1]
            reviewer_ids = await self._resolve_users_for_roles(measurement.project_id, next_level.allowed_roles)
            await self.notification_service.notify(
                reviewer_ids,
                type="MEASUREMENT_PM_APPROVED",
                title="Measurement awaiting your approval",
                message=(
                    f"A measurement dated {measurement.measurement_date} was approved at the "
                    f"{level.label} level and now needs {next_level.label}."
                ),
                project_id=measurement.project_id,
                link_url=_MEASUREMENTS_LINK,
                related_entity_type="MEASUREMENT",
                related_entity_id=measurement.id,
            )
        return result

    async def reject(
        self, measurement_id: uuid.UUID, actor_id: uuid.UUID, actor_role: UserRole, data: MeasurementActionRequest
    ) -> Measurement:
        measurement = await self.get(measurement_id)
        current = measurement.status
        definition = await self._get_effective_workflow(measurement.project_id)
        codes = [lvl.status_code for lvl in definition.levels]

        level = None
        if current == SUBMITTED and definition.levels:
            level = definition.levels[0]
        elif current in codes:
            idx = codes.index(current)
            if idx + 1 < len(definition.levels):
                level = definition.levels[idx + 1]

        if level is None or not level.allow_reject:
            raise PermissionDeniedError(f"Measurement in status {current} cannot be rejected.")
        if actor_role != UserRole.ADMIN and actor_role.value not in level.allowed_roles:
            raise PermissionDeniedError(f"Only {', '.join(level.allowed_roles)} may reject at this level.")

        domain_levels = self._to_domain_levels(definition)
        result = await self._record_transition(measurement, REJECTED, actor_id, data.remarks, domain_levels)
        await self.production_service.sync_from_measurements(
            measurement.project_id, measurement.boq_item_id, measurement.measurement_date, actor_id
        )
        await self.notification_service.notify(
            [measurement.recorded_by],
            type="MEASUREMENT_REJECTED",
            title="Measurement rejected",
            message=f"Your measurement dated {measurement.measurement_date} was rejected."
            + (f" Remarks: {data.remarks}" if data.remarks else ""),
            project_id=measurement.project_id,
            link_url=_MEASUREMENTS_FIELD_LINK,
            related_entity_type="MEASUREMENT",
            related_entity_id=measurement.id,
        )
        return result

    async def lock(
        self, measurement_id: uuid.UUID, actor_id: uuid.UUID, actor_role: UserRole, data: MeasurementActionRequest
    ) -> Measurement:
        measurement = await self.get(measurement_id)
        definition = await self._get_effective_workflow(measurement.project_id)
        lock_roles = definition.lock_allowed_roles or []
        if actor_role != UserRole.ADMIN and actor_role.value not in lock_roles:
            raise PermissionDeniedError("Not permitted to lock measurements for this project.")

        final_level = next((lvl for lvl in definition.levels if lvl.is_final_approval), None)
        if final_level is None or measurement.status != final_level.status_code:
            raise PermissionDeniedError(f"Measurement in status {measurement.status} is not awaiting lock.")

        from_status = measurement.status
        before = serialize_model(measurement)

        boq_item = await self.boq_repo.get(measurement.boq_item_id)
        if boq_item is None:
            raise NotFoundError("BOQ item for this measurement no longer exists.")
        boq_item.consumed_qty += measurement.computed_qty

        approval = MeasurementApproval(
            measurement_id=measurement.id,
            from_status=from_status,
            to_status=LOCKED,
            acted_by=actor_id,
            remarks=data.remarks,
            acted_at=datetime.now(timezone.utc),
        )
        self.session.add(approval)
        measurement.status = LOCKED
        await self.session.flush()
        await self.audit.record(
            entity_type="MEASUREMENT",
            entity_id=measurement.id,
            action=AuditAction.STATUS_CHANGE,
            actor_id=actor_id,
            before=before,
            after=serialize_model(measurement),
        )
        await self.session.commit()
        await self.session.refresh(measurement)

        await self.notification_service.notify(
            [measurement.recorded_by],
            type="MEASUREMENT_LOCKED",
            title="Measurement locked",
            message=f"Your measurement dated {measurement.measurement_date} has been locked and is now billable.",
            project_id=measurement.project_id,
            link_url=_MEASUREMENTS_FIELD_LINK,
            related_entity_type="MEASUREMENT",
            related_entity_id=measurement.id,
        )
        return measurement

    async def update(
        self, measurement_id: uuid.UUID, data: MeasurementUpdate, actor_id: uuid.UUID, actor_role: UserRole
    ) -> Measurement:
        measurement = await self.get(measurement_id)
        if measurement.status != DRAFT:
            raise PermissionDeniedError("Only DRAFT measurements can be edited.")
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

    async def recall(
        self, measurement_id: uuid.UUID, actor_id: uuid.UUID, actor_role: UserRole
    ) -> Measurement:
        measurement = await self.get(measurement_id)
        if measurement.status != REJECTED:
            raise PermissionDeniedError("Only REJECTED measurements can be recalled to draft.")
        if measurement.recorded_by != actor_id and actor_role != UserRole.ADMIN:
            raise PermissionDeniedError("Only the recording engineer can recall this measurement.")
        definition = await self._get_effective_workflow(measurement.project_id)
        domain_levels = self._to_domain_levels(definition)
        result = await self._record_transition(measurement, DRAFT, actor_id, None, domain_levels)
        await self.notification_service.notify(
            [measurement.recorded_by],
            type="MEASUREMENT_RECALLED",
            title="Measurement recalled to draft",
            message=f"Your rejected measurement dated {measurement.measurement_date} has been recalled to draft. You may edit and resubmit it.",
            project_id=measurement.project_id,
            link_url=_MEASUREMENTS_FIELD_LINK,
            related_entity_type="MEASUREMENT",
            related_entity_id=measurement.id,
        )
        return result

    async def delete(
        self, measurement_id: uuid.UUID, actor_id: uuid.UUID, actor_role: UserRole
    ) -> None:
        measurement = await self.get(measurement_id)
        if measurement.status != DRAFT:
            raise PermissionDeniedError("Only DRAFT measurements can be deleted.")
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
