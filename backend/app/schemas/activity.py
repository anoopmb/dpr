import uuid
from datetime import date

from pydantic import BaseModel


class ActivityEntry(BaseModel):
    activity_date: date
    type: str
    description: str
    project_id: uuid.UUID
    project_name: str
    link_url: str


class ActivityListRead(BaseModel):
    items: list[ActivityEntry]
