import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select as sa_select

from app.api.deps import CurrentUserDep, SessionDep, require_role
from app.models.boq_construction_template import BoqConstructionTemplate
from app.models.user import UserRole
from app.schemas.boq_construction_template import (
    BoqConstructionTemplateCreate,
    BoqConstructionTemplateRead,
    BoqConstructionTemplateUpdate,
)
from app.schemas.measurement import AutoMaterialRead
from app.services.material_template_service import SUPPORTED_CONCRETE_GRADES, MaterialTemplateService

templates_router = APIRouter(prefix="/construction-templates", tags=["construction-templates"])
material_preview_router = APIRouter(prefix="/material-templates", tags=["construction-templates"])

_ADMIN_ONLY = (UserRole.ADMIN,)


@templates_router.get("", response_model=list[BoqConstructionTemplateRead])
async def list_construction_templates(
    session: SessionDep,
    _: CurrentUserDep,
    construction_type: str | None = Query(default=None),
) -> list[BoqConstructionTemplateRead]:
    q = sa_select(BoqConstructionTemplate)
    if construction_type:
        q = q.where(BoqConstructionTemplate.construction_type == construction_type)
    rows = await session.execute(q)
    return [BoqConstructionTemplateRead.from_orm_with_joins(r) for r in rows.scalars().all()]


@templates_router.post(
    "",
    response_model=BoqConstructionTemplateRead,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_role(*_ADMIN_ONLY))],
)
async def create_construction_template(
    data: BoqConstructionTemplateCreate, session: SessionDep, _: CurrentUserDep
) -> BoqConstructionTemplateRead:
    obj = BoqConstructionTemplate(**data.model_dump())
    session.add(obj)
    await session.commit()
    await session.refresh(obj)
    return BoqConstructionTemplateRead.from_orm_with_joins(obj)


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
    return BoqConstructionTemplateRead.from_orm_with_joins(obj)


@templates_router.delete(
    "/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_role(*_ADMIN_ONLY))],
)
async def delete_construction_template(
    template_id: uuid.UUID, session: SessionDep, _: CurrentUserDep
) -> None:
    from app.core.exceptions import NotFoundError
    obj = await session.get(BoqConstructionTemplate, template_id)
    if obj is None:
        raise NotFoundError("Construction template not found.")
    await session.delete(obj)
    await session.commit()


@material_preview_router.get("/preview", response_model=list[AutoMaterialRead])
async def preview_material_template(
    session: SessionDep,
    _: CurrentUserDep,
    construction_type: str = Query(...),
    qty: Decimal = Query(..., gt=0),
    construction_subtype: str | None = Query(default=None),
) -> list[AutoMaterialRead]:
    from app.core.exceptions import DomainError
    svc = MaterialTemplateService(session)

    if construction_type == "CONCRETE":
        if not construction_subtype or construction_subtype not in SUPPORTED_CONCRETE_GRADES:
            raise DomainError(f"construction_subtype required for CONCRETE. Supported: {SUPPORTED_CONCRETE_GRADES}")
        results = await svc.compute_concrete_materials(construction_subtype, qty)
    elif construction_type == "STEEL":
        raise DomainError("STEEL preview requires steel_lines; use the measurement create endpoint.")
    else:
        results = await svc.compute_bituminous_materials(construction_type, qty)

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
