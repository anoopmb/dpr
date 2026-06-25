import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import DomainError, DuplicateError, NotFoundError
from app.models.audit import AuditAction
from app.models.workflow_config import WorkflowDefinition, WorkflowEntityType, WorkflowStage
from app.schemas.workflow_config import WorkflowDefinitionCreate, WorkflowDefinitionUpdate
from app.services.audit_service import AuditService, serialize_model


class WorkflowConfigService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.audit = AuditService(session)

    @staticmethod
    def pending_status_codes(definition: WorkflowDefinition) -> list[str]:
        """Statuses that mean "hasn't finished this workflow yet": the fixed
        DRAFT/SUBMITTED bookends plus every configured level that isn't the
        final-approval one. REJECTED is deliberately excluded — a rejected
        record isn't "still in flight," it's been bounced and needs a
        separate recall/resubmit action."""
        return ["DRAFT", "SUBMITTED"] + [lvl.status_code for lvl in definition.levels if not lvl.is_final_approval]

    @staticmethod
    def final_approval_status_codes(definition: WorkflowDefinition) -> list[str]:
        return [lvl.status_code for lvl in definition.levels if lvl.is_final_approval]

    @staticmethod
    def feeds_production_status_codes(definition: WorkflowDefinition) -> list[str]:
        return [lvl.status_code for lvl in definition.levels if lvl.feeds_production]

    async def _get_with_levels(self, definition_id: uuid.UUID) -> WorkflowDefinition:
        result = await self.session.execute(
            select(WorkflowDefinition)
            .options(selectinload(WorkflowDefinition.levels))
            .where(WorkflowDefinition.id == definition_id)
        )
        definition = result.scalar_one_or_none()
        if definition is None:
            raise NotFoundError(f"Workflow definition {definition_id} not found.")
        return definition

    async def get_org_default(self, entity_type: WorkflowEntityType) -> WorkflowDefinition | None:
        result = await self.session.execute(
            select(WorkflowDefinition)
            .options(selectinload(WorkflowDefinition.levels))
            .where(WorkflowDefinition.entity_type == entity_type, WorkflowDefinition.project_id.is_(None))
        )
        return result.scalar_one_or_none()

    async def get_project_override(
        self, entity_type: WorkflowEntityType, project_id: uuid.UUID
    ) -> WorkflowDefinition | None:
        result = await self.session.execute(
            select(WorkflowDefinition)
            .options(selectinload(WorkflowDefinition.levels))
            .where(WorkflowDefinition.entity_type == entity_type, WorkflowDefinition.project_id == project_id)
        )
        return result.scalar_one_or_none()

    async def get_effective_definition(
        self, entity_type: WorkflowEntityType, project_id: uuid.UUID | None
    ) -> WorkflowDefinition:
        """Resolves the workflow that actually governs a record: the
        project-specific override if one exists and is active, else the
        org-wide default. Raises if neither exists — the seed migration
        always creates an org default for both entity types, so this should
        only happen if that default was deleted, which the API forbids."""
        if project_id is not None:
            override = await self.get_project_override(entity_type, project_id)
            if override is not None and override.is_active:
                return override
        default = await self.get_org_default(entity_type)
        if default is None:
            raise NotFoundError(f"No org-wide default workflow configured for {entity_type}.")
        return default

    async def list_definitions(self, entity_type: WorkflowEntityType) -> list[WorkflowDefinition]:
        result = await self.session.execute(
            select(WorkflowDefinition)
            .options(selectinload(WorkflowDefinition.levels))
            .where(WorkflowDefinition.entity_type == entity_type)
            .order_by(WorkflowDefinition.project_id.is_(None).desc())
        )
        return list(result.scalars().all())

    def _validate_levels(self, levels: list, entity_type: WorkflowEntityType) -> None:
        status_codes = [lvl.status_code for lvl in levels]
        if len(status_codes) != len(set(status_codes)):
            raise DomainError("Level status codes must be unique within a workflow.")

        final_levels = [lvl for lvl in levels if lvl.is_final_approval]
        if len(final_levels) > 1:
            raise DomainError("A workflow may have at most one final-approval level.")

        # DRAFT/SUBMITTED/REJECTED are fixed bookends for both entity types.
        # LOCKED (measurement billing eligibility, app/domain/billing/validators.py)
        # is a separate fixed action layered on top of a measurement's final
        # approval level — never a level's own status_code. DPR's terminal
        # status is relied on elsewhere as the literal "APPROVED"
        # (profitability_service.py, worker_ledger_service.py), so the DPR
        # final-approval level is pinned to that exact code; everything else
        # is free text (the level's display `label` is always configurable
        # regardless of which of these apply to its status_code).
        reserved = {"DRAFT", "SUBMITTED", "REJECTED"}
        if entity_type == WorkflowEntityType.MEASUREMENT:
            reserved.add("LOCKED")

        for lvl in levels:
            if entity_type == WorkflowEntityType.DPR_HEADER and lvl.is_final_approval:
                if lvl.status_code != "APPROVED":
                    raise DomainError(
                        "The DPR workflow's final-approval level must use status_code 'APPROVED'."
                    )
                continue
            if lvl.status_code in reserved or (
                entity_type == WorkflowEntityType.DPR_HEADER and lvl.status_code == "APPROVED"
            ):
                raise DomainError(
                    f"'{lvl.status_code}' is a reserved built-in status and cannot be used here."
                )

    async def create(self, data: WorkflowDefinitionCreate, actor_id: uuid.UUID) -> WorkflowDefinition:
        existing = (
            await self.get_project_override(data.entity_type, data.project_id)
            if data.project_id is not None
            else await self.get_org_default(data.entity_type)
        )
        if existing is not None:
            scope = f"project {data.project_id}" if data.project_id else "the org-wide default"
            raise DuplicateError(f"A {data.entity_type} workflow already exists for {scope}.")

        self._validate_levels(data.levels, data.entity_type)

        definition = WorkflowDefinition(
            entity_type=data.entity_type,
            project_id=data.project_id,
            name=data.name,
            approvals_enabled=data.approvals_enabled,
            lock_allowed_roles=[r.value for r in data.lock_allowed_roles] if data.lock_allowed_roles else None,
            is_active=True,
        )
        self.session.add(definition)
        await self.session.flush()

        for i, lvl in enumerate(data.levels):
            self.session.add(
                WorkflowStage(
                    workflow_definition_id=definition.id,
                    sequence_order=i + 1,
                    status_code=lvl.status_code,
                    label=lvl.label,
                    allowed_roles=[r.value for r in lvl.allowed_roles],
                    allow_reject=lvl.allow_reject,
                    feeds_production=lvl.feeds_production if data.entity_type == WorkflowEntityType.MEASUREMENT else False,
                    is_final_approval=lvl.is_final_approval,
                )
            )
        await self.session.flush()
        await self.audit.record(
            entity_type="WORKFLOW_DEFINITION",
            entity_id=definition.id,
            action=AuditAction.CREATE,
            actor_id=actor_id,
            after=serialize_model(definition),
        )
        await self.session.commit()
        return await self._get_with_levels(definition.id)

    async def update(
        self, definition_id: uuid.UUID, data: WorkflowDefinitionUpdate, actor_id: uuid.UUID
    ) -> WorkflowDefinition:
        definition = await self._get_with_levels(definition_id)
        before = serialize_model(definition)

        if data.name is not None:
            definition.name = data.name
        if data.approvals_enabled is not None:
            definition.approvals_enabled = data.approvals_enabled
        if data.lock_allowed_roles is not None:
            definition.lock_allowed_roles = [r.value for r in data.lock_allowed_roles]

        if data.levels is not None:
            self._validate_levels(data.levels, definition.entity_type)
            for stage in list(definition.levels):
                await self.session.delete(stage)
            await self.session.flush()
            for i, lvl in enumerate(data.levels):
                self.session.add(
                    WorkflowStage(
                        workflow_definition_id=definition.id,
                        sequence_order=i + 1,
                        status_code=lvl.status_code,
                        label=lvl.label,
                        allowed_roles=[r.value for r in lvl.allowed_roles],
                        allow_reject=lvl.allow_reject,
                        feeds_production=(
                            lvl.feeds_production if definition.entity_type == WorkflowEntityType.MEASUREMENT else False
                        ),
                        is_final_approval=lvl.is_final_approval,
                    )
                )

        await self.session.flush()
        await self.audit.record(
            entity_type="WORKFLOW_DEFINITION",
            entity_id=definition.id,
            action=AuditAction.UPDATE,
            actor_id=actor_id,
            before=before,
            after=serialize_model(definition),
        )
        await self.session.commit()
        return await self._get_with_levels(definition.id)

    async def delete(self, definition_id: uuid.UUID, actor_id: uuid.UUID) -> None:
        definition = await self._get_with_levels(definition_id)
        if definition.project_id is None:
            raise DomainError("The org-wide default workflow cannot be deleted.")
        before = serialize_model(definition)
        await self.session.delete(definition)
        await self.audit.record(
            entity_type="WORKFLOW_DEFINITION",
            entity_id=definition_id,
            action=AuditAction.DELETE,
            actor_id=actor_id,
            before=before,
        )
        await self.session.commit()
