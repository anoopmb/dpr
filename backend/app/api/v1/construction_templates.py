import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select as sa_select

from app.api.deps import CurrentUserDep, SessionDep, require_role
from app.models.boq_construction_template import BoqConstructionTemplate, BoqConstructionTemplateItem
from app.models.user import UserRole
from app.schemas.boq_construction_template import (
    BoqConstructionTemplateCreate,
    BoqConstructionTemplateItemCreate,
    BoqConstructionTemplateItemRead,
    BoqConstructionTemplateItemUpdate,
    BoqConstructionTemplateRead,
    BoqConstructionTemplateUpdate,
)
from app.schemas.measurement import AutoMaterialRead
from app.services.material_template_service import MaterialTemplateService

templates_router = APIRouter(prefix="/construction-templates", tags=["construction-templates"])
material_preview_router = APIRouter(prefix="/material-templates", tags=["construction-templates"])

_ADMIN_ONLY = (UserRole.ADMIN,)


# ── Template header CRUD ──────────────────────────────────────────────────────

@templates_router.get("", response_model=list[BoqConstructionTemplateRead])
async def list_construction_templates(
    session: SessionDep,
    _: CurrentUserDep,
    construction_type: str | None = Query(default=None),
    construction_subtype: str | None = Query(default=None),
) -> list[BoqConstructionTemplateRead]:
    q = sa_select(BoqConstructionTemplate)
    if construction_type:
        q = q.where(BoqConstructionTemplate.construction_type == construction_type)
    if construction_subtype is not None:
        q = q.where(BoqConstructionTemplate.construction_subtype == construction_subtype)
    rows = await session.execute(q)
    return [BoqConstructionTemplateRead.from_orm(r) for r in rows.scalars().all()]


@templates_router.post(
    "",
    response_model=BoqConstructionTemplateRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*_ADMIN_ONLY))],
)
async def create_construction_template(
    data: BoqConstructionTemplateCreate, session: SessionDep, _: CurrentUserDep
) -> BoqConstructionTemplateRead:
    from app.core.exceptions import DomainError
    if data.construction_type == "GENERAL":
        raise DomainError("GENERAL type does not use material templates.")
    obj = BoqConstructionTemplate(**data.model_dump())
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return BoqConstructionTemplateRead.from_orm(obj)


@templates_router.patch(
    "/{template_id}",
    response_model=BoqConstructionTemplateRead,
    dependencies=[Depends(require_role(*_ADMIN_ONLY))],
)
async def update_construction_template(
    template_id: uuid.UUID,
    data: BoqConstructionTemplateUpdate,
    session: SessionDep,
    _: CurrentUserDep,
) -> BoqConstructionTemplateRead:
    from app.core.exceptions import NotFoundError
    obj = await session.get(BoqConstructionTemplate, template_id)
    if obj is None:
        raise NotFoundError("Construction template not found.")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(obj, field, value)
    await session.commit()
    await session.refresh(obj)
    return BoqConstructionTemplateRead.from_orm(obj)


@templates_router.delete(
    "/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(*_ADMIN_ONLY))],
)
async def delete_construction_template(
    template_id: uuid.UUID, session: SessionDep, _: CurrentUserDep
) -> None:
    from app.core.exceptions import DomainError, NotFoundError
    from app.models.measurement import Measurement
    obj = await session.get(BoqConstructionTemplate, template_id)
    if obj is None:
        raise NotFoundError("Construction template not found.")
    linked = await session.execute(
        sa_select(Measurement.id).where(Measurement.boq_template_id == template_id).limit(1)
    )
    if linked.scalar_one_or_none() is not None:
        raise DomainError(
            "This template is referenced by existing measurements. "
            "Deactivate it instead of deleting."
        )
    await session.delete(obj)
    await session.commit()


# ── Template item CRUD ────────────────────────────────────────────────────────

@templates_router.post(
    "/{template_id}/items",
    response_model=BoqConstructionTemplateItemRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*_ADMIN_ONLY))],
)
async def add_template_item(
    template_id: uuid.UUID,
    data: BoqConstructionTemplateItemCreate,
    session: SessionDep,
    _: CurrentUserDep,
) -> BoqConstructionTemplateItemRead:
    from app.core.exceptions import DomainError, NotFoundError
    template = await session.get(BoqConstructionTemplate, template_id)
    if template is None:
        raise NotFoundError("Construction template not found.")
    if template.construction_type == "STEEL" and data.bar_diameter_mm is None:
        raise DomainError("bar_diameter_mm is required for STEEL template items.")
    if template.construction_type != "STEEL" and data.bar_diameter_mm is not None:
        raise DomainError("bar_diameter_mm is only valid for STEEL template items.")
    item = BoqConstructionTemplateItem(template_id=template_id, **data.model_dump())
    session.add(item)
    await session.commit()
    await session.refresh(item)
    return BoqConstructionTemplateItemRead.from_orm(item)


@templates_router.patch(
    "/{template_id}/items/{item_id}",
    response_model=BoqConstructionTemplateItemRead,
    dependencies=[Depends(require_role(*_ADMIN_ONLY))],
)
async def update_template_item(
    template_id: uuid.UUID,
    item_id: uuid.UUID,
    data: BoqConstructionTemplateItemUpdate,
    session: SessionDep,
    _: CurrentUserDep,
) -> BoqConstructionTemplateItemRead:
    from app.core.exceptions import NotFoundError
    item = await session.get(BoqConstructionTemplateItem, item_id)
    if item is None or item.template_id != template_id:
        raise NotFoundError("Template item not found.")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(item, field, value)
    await session.commit()
    await session.refresh(item)
    return BoqConstructionTemplateItemRead.from_orm(item)


@templates_router.delete(
    "/{template_id}/items/{item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(*_ADMIN_ONLY))],
)
async def delete_template_item(
    template_id: uuid.UUID,
    item_id: uuid.UUID,
    session: SessionDep,
    _: CurrentUserDep,
) -> None:
    from app.core.exceptions import NotFoundError
    item = await session.get(BoqConstructionTemplateItem, item_id)
    if item is None or item.template_id != template_id:
        raise NotFoundError("Template item not found.")
    await session.delete(item)
    await session.commit()


# ── Material preview ──────────────────────────────────────────────────────────

@material_preview_router.get("/preview", response_model=list[AutoMaterialRead])
async def preview_material_template(
    session: SessionDep,
    _: CurrentUserDep,
    template_id: uuid.UUID = Query(...),
    qty: Decimal = Query(..., gt=0),
) -> list[AutoMaterialRead]:
    from app.core.exceptions import DomainError
    svc = MaterialTemplateService(session)
    template = await svc.get_template(template_id)
    if template is None or not template.is_active:
        raise DomainError("Template not found or inactive.")
    if template.construction_type == "STEEL":
        raise DomainError("STEEL preview requires steel_lines; use the measurement create endpoint.")
    results = await svc.compute_materials(template_id, qty)
    return [
        AutoMaterialRead(
            material_id=r.material_id,
            material_code=r.material_code,
            material_name=r.material_name,
            computed_qty=r.computed_qty,
            uom_code=r.uom_code,
            rate=r.rate,
            manually_edited=False,
        )
        for r in results
    ]
