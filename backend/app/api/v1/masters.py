import uuid

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel

from app.api.deps import CurrentUserDep, SessionDep, require_role
from app.models.base import TimestampedBase
from app.models.department import Department
from app.models.master_data import (
    ExpenseCategoryMaster,
    MachineryMaster,
    MaterialMaster,
    UomMaster,
    WorkerCategoryMaster,
    WorkTypeMaster,
)
from app.models.stock_location import StockLocation
from app.models.user import UserRole
from app.schemas.master_data import (
    DepartmentCreate,
    DepartmentRead,
    DepartmentUpdate,
    ExpenseCategoryCreate,
    ExpenseCategoryRead,
    ExpenseCategoryUpdate,
    MachineryCreate,
    MachineryRead,
    MachineryUpdate,
    MaterialCreate,
    MaterialRead,
    MaterialUpdate,
    StockLocationCreate,
    StockLocationRead,
    StockLocationUpdate,
    UomCreate,
    UomRead,
    UomUpdate,
    WorkerCategoryCreate,
    WorkerCategoryRead,
    WorkerCategoryUpdate,
    WorkTypeCreate,
    WorkTypeRead,
    WorkTypeUpdate,
)
from app.services.master_data_service import MasterDataService

router = APIRouter(prefix="/masters", tags=["masters"])


def _register_master_routes(
    *,
    path: str,
    model: type[TimestampedBase],
    create_schema: type[BaseModel],
    read_schema: type[BaseModel],
    update_schema: type[BaseModel],
) -> None:
    @router.get(f"/{path}", response_model=list[read_schema], name=f"list_{path}")
    async def list_items(session: SessionDep, _: CurrentUserDep, limit: int = 200, offset: int = 0):
        items = await MasterDataService(session, model).list(limit=limit, offset=offset)
        return [read_schema.model_validate(i) for i in items]

    @router.get(f"/{path}/{{item_id}}", response_model=read_schema, name=f"get_{path}")
    async def get_item(item_id: uuid.UUID, session: SessionDep, _: CurrentUserDep):
        item = await MasterDataService(session, model).get(item_id)
        return read_schema.model_validate(item)

    @router.post(
        f"/{path}",
        response_model=read_schema,
        status_code=status.HTTP_201_CREATED,
        dependencies=[Depends(require_role(UserRole.ADMIN))],
        name=f"create_{path}",
    )
    async def create_item(data: create_schema, session: SessionDep):
        item = await MasterDataService(session, model).create(data)
        return read_schema.model_validate(item)

    @router.patch(
        f"/{path}/{{item_id}}",
        response_model=read_schema,
        dependencies=[Depends(require_role(UserRole.ADMIN))],
        name=f"update_{path}",
    )
    async def update_item(item_id: uuid.UUID, data: update_schema, session: SessionDep):
        item = await MasterDataService(session, model).update(item_id, data)
        return read_schema.model_validate(item)

    @router.delete(
        f"/{path}/{{item_id}}",
        status_code=status.HTTP_204_NO_CONTENT,
        dependencies=[Depends(require_role(UserRole.ADMIN))],
        name=f"delete_{path}",
    )
    async def delete_item(item_id: uuid.UUID, session: SessionDep):
        await MasterDataService(session, model).delete(item_id)


_register_master_routes(
    path="departments", model=Department,
    create_schema=DepartmentCreate, read_schema=DepartmentRead, update_schema=DepartmentUpdate,
)
_register_master_routes(
    path="uoms", model=UomMaster,
    create_schema=UomCreate, read_schema=UomRead, update_schema=UomUpdate,
)
_register_master_routes(
    path="work-types", model=WorkTypeMaster,
    create_schema=WorkTypeCreate, read_schema=WorkTypeRead, update_schema=WorkTypeUpdate,
)
_register_master_routes(
    path="materials", model=MaterialMaster,
    create_schema=MaterialCreate, read_schema=MaterialRead, update_schema=MaterialUpdate,
)
_register_master_routes(
    path="machinery", model=MachineryMaster,
    create_schema=MachineryCreate, read_schema=MachineryRead, update_schema=MachineryUpdate,
)
_register_master_routes(
    path="worker-categories", model=WorkerCategoryMaster,
    create_schema=WorkerCategoryCreate, read_schema=WorkerCategoryRead, update_schema=WorkerCategoryUpdate,
)
_register_master_routes(
    path="expense-categories", model=ExpenseCategoryMaster,
    create_schema=ExpenseCategoryCreate, read_schema=ExpenseCategoryRead, update_schema=ExpenseCategoryUpdate,
)
_register_master_routes(
    path="stock-locations", model=StockLocation,
    create_schema=StockLocationCreate, read_schema=StockLocationRead, update_schema=StockLocationUpdate,
)
