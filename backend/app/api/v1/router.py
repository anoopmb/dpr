from fastapi import APIRouter

from app.api.v1 import (
    attendance,
    auth,
    billing,
    boq,
    boq_template,
    dpr,
    expenses,
    masters,
    material,
    measurements,
    notifications,
    organization_settings,
    photos,
    projects,
    push,
    reports,
    uploads,
    users,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(projects.router)
api_router.include_router(boq.boq_router)
api_router.include_router(boq.sections_router)
api_router.include_router(boq.items_router)
api_router.include_router(boq_template.router)
api_router.include_router(masters.router)
api_router.include_router(measurements.router)
api_router.include_router(material.router)
api_router.include_router(attendance.router)
api_router.include_router(dpr.router)
api_router.include_router(expenses.router)
api_router.include_router(billing.router)
api_router.include_router(uploads.router)
api_router.include_router(photos.router)
api_router.include_router(organization_settings.router)
api_router.include_router(organization_settings.branding_router)
api_router.include_router(notifications.router)
api_router.include_router(reports.router)
api_router.include_router(push.router)
