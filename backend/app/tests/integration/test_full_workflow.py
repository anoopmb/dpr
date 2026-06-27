"""End-to-end smoke test against the real running app + real Postgres
(app.tests.unit tests use no DB at all; this is the integration counterpart
that exercises every module's full lifecycle through actual HTTP calls).

Requires: local Postgres reachable at DATABASE_URL, master data seeded via
`python -m scripts.seed_master_data`, and test users seeded via
`python -m scripts.seed_admin <login_id> <email> <password> <name> <ROLE>`
for ADMIN, PROJECT_MANAGER, QUANTITY_SURVEYOR, SITE_ENGINEER, STORE_KEEPER
using the login_ids/passwords below.

Run explicitly: pytest app/tests/integration -q
(not picked up by `pytest app/tests/unit`, kept separate intentionally).
"""

import uuid
from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

CREDENTIALS = {
    "ADMIN": ("admin2", "secretpass123"),
    "PROJECT_MANAGER": ("pm", "secretpass123"),
    "QUANTITY_SURVEYOR": ("qs", "secretpass123"),
    "SITE_ENGINEER": ("engineer", "secretpass123"),
    "STORE_KEEPER": ("store", "secretpass123"),
}


async def _login(client: AsyncClient, role: str) -> dict:
    login_id, password = CREDENTIALS[role]
    resp = await client.post("/api/v1/auth/login", json={"login_id": login_id, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _csrf(client: AsyncClient) -> dict:
    return {"X-CSRF-Token": client.cookies.get("csrf_token")}


@pytest.mark.asyncio
async def test_full_workflow():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # --- Admin sets up reference data ---
        admin = await _login(client, "ADMIN")
        assert admin["role"] == "ADMIN"

        departments = (await client.get("/api/v1/masters/departments")).json()
        uoms = (await client.get("/api/v1/masters/uoms")).json()
        work_types = (await client.get("/api/v1/masters/work-types")).json()
        materials = (await client.get("/api/v1/masters/materials")).json()
        assert departments and uoms and work_types and materials

        earthwork = next(w for w in work_types if w["code"] == "EARTHWORK")
        uom_for_work_type = earthwork["output_uom_id"]

        ho_location_resp = await client.post(
            "/api/v1/masters/stock-locations",
            json={"name": f"HO Store {uuid.uuid4().hex[:8]}", "location_type": "HEAD_OFFICE", "project_id": None},
            headers=_csrf(client),
        )
        assert ho_location_resp.status_code == 201, ho_location_resp.text
        ho_location_id = ho_location_resp.json()["id"]

        project_resp = await client.post(
            "/api/v1/projects",
            json={
                "department_id": departments[0]["id"],
                "name": "Test Road Project",
                "tender_no": f"TND-{uuid.uuid4().hex[:8]}",
                "contract_value": "10000000.00",
                "start_date": "2026-01-01",
                "completion_date": "2027-01-01",
            },
            headers=_csrf(client),
        )
        assert project_resp.status_code == 201, project_resp.text
        project_id = project_resp.json()["id"]

        boq_resp = await client.post(
            "/api/v1/boq-items",
            json={
                "project_id": project_id,
                "work_type_id": earthwork["id"],
                "uom_id": uom_for_work_type,
                "item_no": "1",
                "description": "Earthwork excavation",
                "tendered_qty": "5000.000",
                "rate": "250.00",
            },
            headers=_csrf(client),
        )
        assert boq_resp.status_code == 201, boq_resp.text
        boq_item_id = boq_resp.json()["id"]

        # --- Site Engineer records a measurement ---
        await _login(client, "SITE_ENGINEER")
        measurement_resp = await client.post(
            "/api/v1/measurements",
            json={
                "project_id": project_id,
                "boq_item_id": boq_item_id,
                "measurement_date": str(date.today()),
                "dimensions": {"length": "100", "width": "2", "depth": "1.5"},
            },
            headers=_csrf(client),
        )
        assert measurement_resp.status_code == 201, measurement_resp.text
        measurement = measurement_resp.json()
        assert measurement["computed_qty"] == "300.000"
        measurement_id = measurement["id"]

        # --- Material indent: site engineer requests, store keeper fulfills ---
        await _login(client, "SITE_ENGINEER")
        indent_resp = await client.post(
            "/api/v1/material-indents",
            json={
                "requesting_project_id": project_id,
                "source_type": "HEAD_OFFICE",
                "source_location_id": ho_location_id,
                "items": [{"material_id": materials[0]["id"], "uom_id": materials[0]["default_uom_id"], "requested_qty": "100"}],
            },
            headers=_csrf(client),
        )
        assert indent_resp.status_code == 201, indent_resp.text
        indent = indent_resp.json()
        indent_id = indent["id"]
        item_id = indent["items"][0]["id"]

        submit_indent = await client.post(f"/api/v1/material-indents/{indent_id}/submit", headers=_csrf(client))
        assert submit_indent.status_code == 200, submit_indent.text

        await _login(client, "STORE_KEEPER")
        approve_indent = await client.post(f"/api/v1/material-indents/{indent_id}/approve", headers=_csrf(client))
        assert approve_indent.status_code == 200, approve_indent.text
        assert approve_indent.json()["status"] == "APPROVED"

        issue_resp = await client.post(
            f"/api/v1/material-indents/items/{item_id}/issue",
            json={"issued_qty": "100", "vehicle_ref": "TRK-1"},
            headers=_csrf(client),
        )
        assert issue_resp.status_code == 200, issue_resp.text
        assert issue_resp.json()["issued_qty"] == "100.000"

        await _login(client, "SITE_ENGINEER")
        receive_resp = await client.post(
            f"/api/v1/material-indents/items/{item_id}/receive",
            json={"received_qty": "100"},
            headers=_csrf(client),
        )
        assert receive_resp.status_code == 200, receive_resp.text
        assert receive_resp.json()["received_qty"] == "100.000"

        indent_final = (await client.get(f"/api/v1/material-indents/{indent_id}")).json()
        assert indent_final["status"] == "RECEIVED"

        # --- Worker + attendance ---
        worker_categories = (await client.get("/api/v1/masters/worker-categories")).json()
        worker_resp = await client.post(
            "/api/v1/workers",
            json={
                "project_id": project_id,
                "worker_category_id": worker_categories[0]["id"],
                "full_name": "Test Mason",
            },
            headers=_csrf(client),
        )
        assert worker_resp.status_code == 201, worker_resp.text
        worker_id = worker_resp.json()["id"]

        checkin_resp = await client.post(
            "/api/v1/attendance/check-in",
            json={
                "worker_id": worker_id,
                "project_id": project_id,
                "latitude": "12.9716",
                "longitude": "77.5946",
                "photo_url": "https://example.com/photo.jpg",
            },
            headers=_csrf(client),
        )
        assert checkin_resp.status_code == 201, checkin_resp.text
        assert checkin_resp.json()["within_geofence"] is True  # no geofence configured on this project

        duplicate_checkin = await client.post(
            "/api/v1/attendance/check-in",
            json={
                "worker_id": worker_id,
                "project_id": project_id,
                "latitude": "12.9716",
                "longitude": "77.5946",
                "photo_url": "https://example.com/photo2.jpg",
            },
            headers=_csrf(client),
        )
        assert duplicate_checkin.status_code == 422
        assert duplicate_checkin.json()["code"] == "ALREADY_CHECKED_IN"

        # --- Expense ---
        expense_categories = (await client.get("/api/v1/masters/expense-categories")).json()
        expense_resp = await client.post(
            "/api/v1/expenses",
            json={
                "project_id": project_id,
                "expense_category_id": expense_categories[0]["id"],
                "amount": "1500.00",
                "expense_date": str(date.today()),
                "vendor_name": "Local Hardware Store",
            },
            headers=_csrf(client),
        )
        assert expense_resp.status_code == 201, expense_resp.text

        # --- Billing ---
        await _login(client, "QUANTITY_SURVEYOR")
        bill_resp = await client.post(
            "/api/v1/running-bills",
            json={
                "project_id": project_id,
                "bill_number": f"RB-{uuid.uuid4().hex[:8]}",
                "bill_date": str(date.today()),
                "from_date": "2026-01-01",
                "to_date": str(date.today()),
                "measurement_ids": [measurement_id],
            },
            headers=_csrf(client),
        )
        assert bill_resp.status_code == 201, bill_resp.text
        bill = bill_resp.json()
        bill_id = bill["id"]
        assert bill["total_amount"] == "75000.00"  # 300.000 qty * 250.00 rate

        # Re-billing the same (now billed=True) measurement must be rejected.
        rebill_resp = await client.post(
            "/api/v1/running-bills",
            json={
                "project_id": project_id,
                "bill_number": f"RB-{uuid.uuid4().hex[:8]}",
                "bill_date": str(date.today()),
                "from_date": "2026-01-01",
                "to_date": str(date.today()),
                "measurement_ids": [measurement_id],
            },
            headers=_csrf(client),
        )
        assert rebill_resp.status_code == 422
        assert rebill_resp.json()["code"] == "BILLING_VALIDATION_ERROR"

        payment_resp = await client.post(
            f"/api/v1/running-bills/{bill_id}/payments",
            json={"amount_received": "75000.00", "received_date": str(date.today())},
            headers=_csrf(client),
        )
        assert payment_resp.status_code == 201, payment_resp.text

        bill_after_payment = (await client.get(f"/api/v1/running-bills/{bill_id}")).json()
        assert bill_after_payment["status"] == "PAID"

        # --- RBAC: site engineer must not be able to create a project ---
        await _login(client, "SITE_ENGINEER")
        forbidden_resp = await client.post(
            "/api/v1/projects",
            json={
                "department_id": departments[0]["id"],
                "name": "Should Not Be Created",
                "tender_no": f"TND-{uuid.uuid4().hex[:8]}",
                "contract_value": "1000.00",
                "start_date": "2026-01-01",
                "completion_date": "2027-01-01",
            },
            headers=_csrf(client),
        )
        assert forbidden_resp.status_code == 403
        assert forbidden_resp.json()["code"] == "PERMISSION_DENIED"

        # NOTE: file upload (/api/v1/uploads/*) is intentionally not exercised
        # here — it requires a reachable S3/MinIO endpoint, and none is
        # installed in this environment (no Docker, per project decision).
        # core/storage.py is covered separately by mocked unit tests.

        await client.post("/api/v1/auth/logout")


@pytest.mark.asyncio
async def test_configurable_attendance_verification():
    """Covers the settings-page toggle: when a project does not require
    photo/GPS verification, supervisors can auto-mark workers present
    (on worker creation, and in bulk) with no photo/GPS; when it does
    require verification (the default), those shortcuts are rejected."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await _login(client, "ADMIN")
        departments = (await client.get("/api/v1/masters/departments")).json()
        worker_categories = (await client.get("/api/v1/masters/worker-categories")).json()

        # --- Project with verification NOT required ---
        relaxed_project_resp = await client.post(
            "/api/v1/projects",
            json={
                "department_id": departments[0]["id"],
                "name": "Relaxed Attendance Project",
                "tender_no": f"TND-{uuid.uuid4().hex[:8]}",
                "contract_value": "1000000.00",
                "start_date": "2026-01-01",
                "completion_date": "2027-01-01",
                "attendance_photo_required": False,
                "attendance_gps_required": False,
            },
            headers=_csrf(client),
        )
        assert relaxed_project_resp.status_code == 201, relaxed_project_resp.text
        relaxed_project_id = relaxed_project_resp.json()["id"]
        assert relaxed_project_resp.json()["attendance_photo_required"] is False
        assert relaxed_project_resp.json()["attendance_gps_required"] is False

        await _login(client, "SITE_ENGINEER")

        # Adding a worker with mark_present_today auto-creates attendance, no photo/GPS.
        worker_resp = await client.post(
            "/api/v1/workers",
            json={
                "project_id": relaxed_project_id,
                "worker_category_id": worker_categories[0]["id"],
                "full_name": "Auto Marked Worker",
                "mark_present_today": True,
            },
            headers=_csrf(client),
        )
        assert worker_resp.status_code == 201, worker_resp.text
        worker_id = worker_resp.json()["id"]

        attendance_today = (await client.get(f"/api/v1/attendance/by-project/{relaxed_project_id}")).json()
        auto_record = next(r for r in attendance_today if r["worker_id"] == worker_id)
        assert auto_record["photo_url"] is None
        assert auto_record["within_geofence"] is True

        # Bulk mark-present for a second worker, no photo/GPS required.
        worker2_resp = await client.post(
            "/api/v1/workers",
            json={
                "project_id": relaxed_project_id,
                "worker_category_id": worker_categories[0]["id"],
                "full_name": "Bulk Marked Worker",
            },
            headers=_csrf(client),
        )
        worker2_id = worker2_resp.json()["id"]

        bulk_resp = await client.post(
            "/api/v1/attendance/mark-present",
            json={"project_id": relaxed_project_id, "worker_ids": [worker2_id]},
            headers=_csrf(client),
        )
        assert bulk_resp.status_code == 201, bulk_resp.text
        assert len(bulk_resp.json()) == 1

        # Calling mark-present again for the same worker is idempotent (skipped, not an error).
        bulk_again = await client.post(
            "/api/v1/attendance/mark-present",
            json={"project_id": relaxed_project_id, "worker_ids": [worker2_id]},
            headers=_csrf(client),
        )
        assert bulk_again.status_code == 201
        assert bulk_again.json() == []

        # --- Project with verification required (the default) ---
        await _login(client, "ADMIN")
        strict_project_resp = await client.post(
            "/api/v1/projects",
            json={
                "department_id": departments[0]["id"],
                "name": "Strict Attendance Project",
                "tender_no": f"TND-{uuid.uuid4().hex[:8]}",
                "contract_value": "1000000.00",
                "start_date": "2026-01-01",
                "completion_date": "2027-01-01",
            },
            headers=_csrf(client),
        )
        strict_project_id = strict_project_resp.json()["id"]
        assert strict_project_resp.json()["attendance_photo_required"] is True
        assert strict_project_resp.json()["attendance_gps_required"] is True

        await _login(client, "SITE_ENGINEER")
        rejected_worker_resp = await client.post(
            "/api/v1/workers",
            json={
                "project_id": strict_project_id,
                "worker_category_id": worker_categories[0]["id"],
                "full_name": "Should Not Auto Mark",
                "mark_present_today": True,
            },
            headers=_csrf(client),
        )
        assert rejected_worker_resp.status_code == 422
        assert rejected_worker_resp.json()["code"] == "ATTENDANCE_VERIFICATION_REQUIRED"

        worker3_resp = await client.post(
            "/api/v1/workers",
            json={
                "project_id": strict_project_id,
                "worker_category_id": worker_categories[0]["id"],
                "full_name": "Strict Worker",
            },
            headers=_csrf(client),
        )
        worker3_id = worker3_resp.json()["id"]

        rejected_bulk = await client.post(
            "/api/v1/attendance/mark-present",
            json={"project_id": strict_project_id, "worker_ids": [worker3_id]},
            headers=_csrf(client),
        )
        assert rejected_bulk.status_code == 422
        assert rejected_bulk.json()["code"] == "ATTENDANCE_VERIFICATION_REQUIRED"

        # Check-in without a photo on the strict project is also rejected.
        rejected_checkin = await client.post(
            "/api/v1/attendance/check-in",
            json={"worker_id": worker3_id, "project_id": strict_project_id, "latitude": "12.97", "longitude": "77.59"},
            headers=_csrf(client),
        )
        assert rejected_checkin.status_code == 422
        assert rejected_checkin.json()["code"] == "ATTENDANCE_VERIFICATION_REQUIRED"

        await client.post("/api/v1/auth/logout")
