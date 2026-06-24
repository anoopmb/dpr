import uuid

from fastapi import APIRouter, status

from app.api.deps import CurrentUserDep, SessionDep
from app.models.project_photo import PhotoEntityType
from app.schemas.project_photo import ProjectPhotoCreate, ProjectPhotoRead
from app.services.project_photo_service import ProjectPhotoService

router = APIRouter(prefix="/photos", tags=["photos"])


@router.post("", response_model=ProjectPhotoRead, status_code=status.HTTP_201_CREATED)
async def create_photo(data: ProjectPhotoCreate, session: SessionDep, current_user: CurrentUserDep) -> ProjectPhotoRead:
    photo = await ProjectPhotoService(session).create(data, uploaded_by=uuid.UUID(current_user.id))
    return ProjectPhotoRead.model_validate(photo)


@router.get("", response_model=list[ProjectPhotoRead])
async def list_photos(
    entity_type: PhotoEntityType, entity_id: uuid.UUID, session: SessionDep, _: CurrentUserDep
) -> list[ProjectPhotoRead]:
    photos = await ProjectPhotoService(session).list_for_entity(entity_type, entity_id)
    return [ProjectPhotoRead.model_validate(p) for p in photos]
