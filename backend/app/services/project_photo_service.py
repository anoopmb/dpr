import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError
from app.models.attendance import AttendanceRecord
from app.models.audit import AuditAction
from app.models.dpr import DprIssue
from app.models.material import MaterialReceipt
from app.models.measurement import Measurement
from app.models.project_photo import PhotoEntityType, ProjectPhoto
from app.repositories.project_photo_repo import ProjectPhotoRepository
from app.schemas.project_photo import ProjectPhotoCreate
from app.services.audit_service import AuditService, serialize_model

_ENTITY_MODEL_MAP = {
    PhotoEntityType.DPR_ISSUE: DprIssue,
    PhotoEntityType.MEASUREMENT: Measurement,
    PhotoEntityType.MATERIAL_RECEIPT: MaterialReceipt,
    PhotoEntityType.ATTENDANCE: AttendanceRecord,
}


class ProjectPhotoService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = ProjectPhotoRepository(session)
        self.audit = AuditService(session)

    async def create(self, data: ProjectPhotoCreate, uploaded_by: uuid.UUID) -> ProjectPhoto:
        model = _ENTITY_MODEL_MAP[data.entity_type]
        entity = await self.session.get(model, data.entity_id)
        if entity is None:
            raise NotFoundError(f"{data.entity_type} {data.entity_id} not found — cannot attach photo.")

        photo = ProjectPhoto(**data.model_dump(), uploaded_by=uploaded_by)
        self.repo.add(photo)
        await self.session.flush()
        await self.audit.record(
            entity_type="PROJECT_PHOTO",
            entity_id=photo.id,
            action=AuditAction.CREATE,
            actor_id=uploaded_by,
            after=serialize_model(photo),
        )
        await self.session.commit()
        await self.session.refresh(photo)
        return photo

    async def list_for_entity(self, entity_type: PhotoEntityType, entity_id: uuid.UUID) -> list[ProjectPhoto]:
        return await self.repo.list_for_entity(entity_type, entity_id)

    async def map_for_measurements(
        self, measurement_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, list[ProjectPhoto]]:
        """Batch-load MEASUREMENT photos for many measurements at once, grouped
        by measurement id — avoids an N+1 when building measurement reads."""
        photos = await self.repo.list_for_entities(PhotoEntityType.MEASUREMENT, measurement_ids)
        grouped: dict[uuid.UUID, list[ProjectPhoto]] = {}
        for photo in photos:
            grouped.setdefault(photo.entity_id, []).append(photo)
        return grouped
