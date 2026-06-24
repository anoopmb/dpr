import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, PermissionDeniedError
from app.domain.measurement.calculators import calculate_quantity
from app.domain.measurement.validators import BoqItemSnapshot, validate_measurement_against_boq
from app.domain.measurement.workflow import MeasurementStatus, transition
from app.models.master_data import WorkTypeMaster
from app.models.measurement import Measurement, MeasurementApproval
from app.models.user import UserRole
from app.repositories.boq_repo import BoqRepository
from app.repositories.measurement_repo import MeasurementRepository
from app.schemas.measurement import MeasurementActionRequest, MeasurementCreate
from app.services.notification_service import NotificationService
from app.services.organization_settings_service import OrganizationSettingsService
from app.services.project_assignment_service import ProjectAssignmentService

_MEASUREMENTS_LINK = "/measurements"
# PM/QS recipients use the desktop approval page; the recorder (often a
# Site Engineer, who is locked out of that desktop-only route) is pointed
# at the field-accessible equivalent instead.
_MEASUREMENTS_FIELD_LINK = "/field/my-measurements"


class MeasurementService:
    def __init__(self, session: AsyncSession, background_tasks: BackgroundTasks | None = None) -> None:
        self.session = session
        self.repo = MeasurementRepository(session)
        self.boq_repo = BoqRepository(session)
        self.settings_service = OrganizationSettingsService(session)
        self.notification_service = NotificationService(session, background_tasks)
        self.assignment_service = ProjectAssignmentService(session)

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

        # Quantized to match measurements.computed_qty's NUMERIC(14,3) scale —
        # the session uses expire_on_commit=False, so the in-memory value
        # returned to the caller must already match what's persisted rather
        # than relying on Postgres to round it after the fact.
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
            status=MeasurementStatus.DRAFT,
            recorded_by=recorded_by,
            chainage=data.chainage,
        )
        self.repo.add(measurement)
        await self.session.commit()
        await self.session.refresh(measurement)
        return measurement

    async def list_for_project(self, project_id: uuid.UUID) -> list[Measurement]:
        return await self.repo.list_for_project(project_id)

    async def get(self, measurement_id: uuid.UUID) -> Measurement:
        measurement = await self.repo.get(measurement_id)
        if measurement is None:
            raise NotFoundError(f"Measurement {measurement_id} not found.")
        return measurement

    async def _record_transition(
        self, measurement: Measurement, target: MeasurementStatus, actor_id: uuid.UUID, remarks: str | None
    ) -> Measurement:
        from_status = measurement.status
        transition(MeasurementStatus(from_status), target)

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
        await self.session.commit()
        await self.session.refresh(measurement)
        return measurement

    async def submit(self, measurement_id: uuid.UUID, actor_id: uuid.UUID, actor_role: UserRole) -> Measurement:
        measurement = await self.get(measurement_id)
        if measurement.recorded_by != actor_id and actor_role != UserRole.ADMIN:
            raise PermissionDeniedError("Only the recording engineer can submit this measurement.")
        result = await self._record_transition(measurement, MeasurementStatus.SUBMITTED, actor_id, None)

        pm_ids = await self.assignment_service.resolve_users_for_role(
            measurement.project_id, UserRole.PROJECT_MANAGER
        )
        await self.notification_service.notify(
            pm_ids,
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
        current = MeasurementStatus(measurement.status)

        if current == MeasurementStatus.SUBMITTED:
            if actor_role not in (UserRole.PROJECT_MANAGER, UserRole.ADMIN):
                raise PermissionDeniedError("Only a Project Manager can approve a submitted measurement.")
            target = MeasurementStatus.PM_APPROVED
        elif current == MeasurementStatus.PM_APPROVED:
            if actor_role not in (UserRole.QUANTITY_SURVEYOR, UserRole.ADMIN):
                raise PermissionDeniedError("Only a Quantity Surveyor can give final approval.")
            target = MeasurementStatus.QS_APPROVED
        else:
            raise PermissionDeniedError(f"Measurement in status {current} is not awaiting approval.")

        result = await self._record_transition(measurement, target, actor_id, data.remarks)

        if target == MeasurementStatus.PM_APPROVED:
            qs_ids = await self.assignment_service.resolve_users_for_role(
                measurement.project_id, UserRole.QUANTITY_SURVEYOR
            )
            await self.notification_service.notify(
                qs_ids,
                type="MEASUREMENT_PM_APPROVED",
                title="Measurement awaiting your final approval",
                message=f"A measurement dated {measurement.measurement_date} was PM-approved and now needs QS approval.",
                project_id=measurement.project_id,
                link_url=_MEASUREMENTS_LINK,
                related_entity_type="MEASUREMENT",
                related_entity_id=measurement.id,
            )
        else:
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
        return result

    async def reject(
        self, measurement_id: uuid.UUID, actor_id: uuid.UUID, actor_role: UserRole, data: MeasurementActionRequest
    ) -> Measurement:
        measurement = await self.get(measurement_id)
        if actor_role not in (UserRole.PROJECT_MANAGER, UserRole.QUANTITY_SURVEYOR, UserRole.ADMIN):
            raise PermissionDeniedError("Only PM/QS/Admin can reject a measurement.")
        result = await self._record_transition(measurement, MeasurementStatus.REJECTED, actor_id, data.remarks)
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
        """Final step: locks the measurement and, in the same transaction,
        advances boq_item.consumed_qty — the financial effect only takes
        hold once a measurement is fully approved and locked, not at draft
        creation, so in-flight/rejected drafts never distort consumption."""
        measurement = await self.get(measurement_id)
        if actor_role not in (UserRole.QUANTITY_SURVEYOR, UserRole.ADMIN):
            raise PermissionDeniedError("Only a Quantity Surveyor can lock a measurement.")

        from_status = measurement.status
        transition(MeasurementStatus(from_status), MeasurementStatus.LOCKED)

        boq_item = await self.boq_repo.get(measurement.boq_item_id)
        if boq_item is None:
            raise NotFoundError("BOQ item for this measurement no longer exists.")
        boq_item.consumed_qty += measurement.computed_qty

        approval = MeasurementApproval(
            measurement_id=measurement.id,
            from_status=from_status,
            to_status=MeasurementStatus.LOCKED,
            acted_by=actor_id,
            remarks=data.remarks,
            acted_at=datetime.now(timezone.utc),
        )
        self.session.add(approval)
        measurement.status = MeasurementStatus.LOCKED
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
