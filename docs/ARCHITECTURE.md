# DPR / MB / Billing System — Architecture (Finalized)

Government-contractor focused system covering: Project Master, BOQ & Approved
Quantities, Daily Progress Report (DPR), Measurement Book (MB) with approval
workflow, Material Stock Requests (site ↔ Head Office / site-to-site, no
procurement), Attendance (named worker + photo/GPS, no payroll), Expense
Tracking, Running Bills, Payments, and Profitability/Cash Flow dashboards.

## 0. Scope Boundary — what this system does NOT do

This is deliberately **not a full ERP**. The company has a separate Accounts
department/system that owns vendor invoicing, payments, and payroll. This
system stays out of that territory by design:

- **No Vendor Management module.** No vendor master, no Purchase Orders, no
  GRN-to-vendor-bill matching, no payment/ageing tracking. Local/petty
  purchases are logged as a plain `expenses` entry (amount, category, photo
  of bill, free-text vendor name for reference only) — Accounts reconciles
  payment separately.
- **No procurement for bulk material.** Site material need is met by an
  **internal stock request**, not a purchase: a site raises an Indent, it's
  fulfilled either by the Head Office store or by transfer from another site
  with surplus — never by buying from an external vendor through this system.
- **No payroll.** Attendance is tracked (who was on-site, when, with
  photo/GPS proof) purely to feed DPR/productivity reporting and to give
  dispute-proof evidence. There is no wage calculation, payslip generation,
  or payout tracking — that stays in whatever payroll system Accounts runs.
- **What this system hands off to Accounts**: categorized expense entries,
  material consumption data, and attendance/productivity data — as reports/
  exports, not as a shared transactional ledger.

## 1. Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Backend framework | FastAPI | async, OpenAPI auto-docs, Pydantic-native |
| ORM | SQLAlchemy 2.0 (async) | explicit, mature, works with Alembic |
| Migrations | Alembic | versioned, reviewable schema changes |
| Validation | Pydantic v2 + DB constraints | defense in depth, never trust one layer |
| Database | PostgreSQL 16 | `numeric` for money/qty, row locking for concurrent MB edits, JSONB for formula storage |
| Cache / queue broker | Redis | Celery broker + dashboard caching |
| Background jobs | Celery | bill PDF generation, report exports, notifications |
| Auth | JWT-in-httpOnly-cookie (access + refresh) + signed double-submit CSRF + RBAC | Site Engineer / PM / QS / Store Keeper / Admin roles |
| File storage | S3-compatible (MinIO or AWS S3) | geotagged photos, signed documents |
| Frontend | React + Vite + TypeScript | type safety end-to-end |
| UI kit | Ant Design (+ ProComponents) | enterprise-grade tables/forms/approval flows |
| Data fetching | TanStack Query | caching, optimistic updates |
| Client state | Zustand | lightweight, no Redux boilerplate |
| Forms | React Hook Form + Zod | client-side validation mirrors backend Pydantic |
| API typing | openapi-typescript / orval | generates TS client from FastAPI OpenAPI spec — single source of truth |
| Mobile delivery | Responsive PWA (vite-plugin-pwa) | one codebase for desktop dashboard + field entry, installable, camera/GPS via browser APIs |
| Theming | AntD `ConfigProvider` + `theme.algorithm` (dark/light) | system-wide theme switch, persisted per user |
| Testing (BE) | Pytest + pytest-asyncio + Testcontainers | real Postgres in tests, not mocks |
| Testing (FE) | Vitest + React Testing Library + Playwright | unit + E2E |
| Observability | structlog (JSON logs) + OpenTelemetry + Sentry | required once real money/approvals flow through it |
| CI/CD | GitHub Actions | lint, type-check, test, migration-check, build |
| Deployment | Plain process deployment (uvicorn/gunicorn + systemd, or a PaaS) | **No Docker** — run backend/frontend directly on host/VM; Postgres and Redis installed natively or as managed services |

> Decision: no containerization. Backend runs via `uvicorn` (behind `gunicorn`/systemd in prod), frontend is built to static assets served by Nginx/any static host. Postgres and Redis are installed directly on the host or used as managed cloud services.

> Decision: cookie+CSRF over bearer JWT. The session token stays a signed
> JWT (unchanged content — `sub`, `role`, `exp`), but it now travels in an
> **httpOnly** `access_token` cookie instead of a JS-readable
> `Authorization` header, so an XSS bug can no longer exfiltrate it from
> `localStorage`. CSRF is handled via a **signed double-submit cookie**: a
> random token is generated at login, set as a separate non-httpOnly
> `csrf_token` cookie (JS-readable) and also embedded as a `csrf` claim
> inside the access-token JWT; mutating requests must echo it back as an
> `X-CSRF-Token` header, which the backend compares against the claim in
> the already-signature-verified cookie — no server-side CSRF store needed.
> **Safari/ITP check**: Safari blocks third-party (cross-site) cookies, not
> first-party ones. Frontend and backend are same-site (same registrable
> domain in prod; differing only by port on `localhost` in dev, which does
> not affect `SameSite`), so `SameSite=Lax` cookies behave normally in
> Safari. `Secure` is only mandatory for `SameSite=None`, which isn't used
> here. No Safari-specific workaround needed, provided frontend/backend
> stay same-site in deployment.

## 2. Architectural Pattern

Layered architecture with an explicit domain service layer — not bare CRUD routers:

```
Router (API)  →  Service (business logic)  →  Repository (data access)  →  Model (ORM)
                        ↓
                  Domain validators / calculators
                        ↓
                  Unit of Work (transaction boundary)
```

- **Routers** — thin. Parse request, call service, return response. No business logic.
- **Services** — own business rules (e.g. "MB can't be approved if BOQ quantity exceeded by >10% without a Variation Order").
- **Repositories** — isolate SQLAlchemy queries from business logic, keep services testable without a DB.
- **Unit of Work** — wraps multi-table writes (approving an MB updates `measurements`, `boq_items.consumed_qty`, and `audit_log` in one transaction).
- **`domain/`** — pure business logic (calculators, validators, workflow state machines). Never imports FastAPI or SQLAlchemy models — operates on plain dataclasses/Pydantic objects, so it's unit-testable in milliseconds with no DB.

This is intentionally "clean enough" layered architecture, not full DDD/hexagonal — right amount of rigor for a team-sized contractor ERP.

## 3. Backend Folder Structure

```
backend/
  app/
    main.py                      # FastAPI app factory, middleware, router mounting
    core/
      config.py                  # Pydantic Settings (env-driven)
      security.py                # JWT, password hashing
      logging.py                 # structlog setup
      exceptions.py              # domain exception hierarchy
      db.py                      # async engine/session factory
    api/
      deps.py                    # get_db, get_current_user, require_role()
      v1/
        router.py                # aggregates all v1 routers
        projects.py
        boq.py
        dpr.py
        measurements.py
        material.py
        attendance.py
        expenses.py
        billing.py
        payments.py
        users.py
        masters.py                # CRUD for master/lookup tables
    domain/                      # pure business logic, no FastAPI/SQLAlchemy imports
      measurement/
        calculators.py           # qty = f(shape, dimensions) — formula engine
        validators.py            # business rules (over-execution %, approval gating)
        workflow.py              # approval state machine
      billing/
        bill_generator.py
        validators.py
      boq/
        consumption.py           # tracks executed vs tendered qty
      material/
        workflow.py              # indent state machine: DRAFT->...->RECEIVED
        validators.py            # issued_qty<=requested_qty, received_qty<=issued_qty
      attendance/
        validators.py            # geofence distance check (haversine) vs project site coords
    models/                      # SQLAlchemy ORM models (1 file per aggregate)
      department.py
      user.py
      master_data.py             # Uom, WorkType, Material, Machinery, WorkerCategory, ExpenseCategory
      stock_location.py
      project.py
      worker.py
      boq.py
      variation_order.py
      dpr.py
      attendance.py
      measurement.py
      material.py
      expense.py
      billing.py
      audit.py
    schemas/                     # Pydantic request/response DTOs
      project.py
      boq.py
      dpr.py
      measurement.py
      material.py
      attendance.py
      expense.py
      billing.py
    repositories/
      base.py                    # generic CRUD repo
      project_repo.py
      boq_repo.py
      measurement_repo.py
      material_repo.py
      attendance_repo.py
      billing_repo.py
    services/
      project_service.py
      dpr_service.py
      measurement_service.py     # orchestrates calculators + validators + repo + UoW
      material_service.py        # indent approval/issue/receive workflow
      attendance_service.py      # check-in + geofence validation
      billing_service.py
      expense_service.py
      auth_service.py
    workers/
      celery_app.py
      tasks/
        bill_pdf.py
        report_export.py
    tests/
      unit/                      # domain + service layer, no DB
      integration/                # repo + API tests, Testcontainers PG
      conftest.py
  alembic/
    versions/
  pyproject.toml
  .env.example
```

## 4. Frontend Folder Structure

```
frontend/
  src/
    app/
      router.tsx
      providers.tsx              # QueryClientProvider, AntD ConfigProvider, AuthProvider, ThemeProvider
    api/
      client.ts                  # axios instance, interceptors (auth refresh, error toast)
      generated/                 # auto-generated types/client from OpenAPI — DO NOT hand-edit
      hooks/
        useProjects.ts
        useBoq.ts
        useMeasurements.ts
        useBilling.ts
    features/                    # feature-sliced, not type-sliced
      projects/
        components/
        pages/
        schemas.ts               # zod schemas mirroring backend Pydantic
      boq/
      dpr/
      measurements/
        components/
          MeasurementSheetDesigner.tsx
          MeasurementEntryMobile.tsx
        formulaEngine.ts          # shared by desktop designer + mobile entry (single source of truth)
      billing/
      expenses/
      field/                      # mobile-first simplified flows for supervisors
        DprToday.tsx
        MaterialsUsed.tsx
        MachineryUsed.tsx
        WorkersUsed.tsx
      auth/
    components/                  # shared/dumb UI components
    store/
      authStore.ts
      uiStore.ts
      themeStore.ts               # persisted dark/light preference
    utils/
    types/
  vite.config.ts                  # includes vite-plugin-pwa config
```

## 5. Validation Strategy — 4 Layers (Defense in Depth)

1. **Client (Zod + React Hook Form)** — fast UX feedback, not trusted. On mobile field forms: inline per-field errors, disabled submit until required dimensions filled.
2. **API schema (Pydantic v2)** — type, range, format (`Decimal`, `gt=0`, enums for status).
3. **Domain validators (`domain/*/validators.py`)** — business rules needing context/DB state:
   - MB quantity can't exceed `boq_item.tendered_qty * 1.1` without an active Variation Order.
   - A bill can only include measurements with `status = APPROVED`.
   - DPR date can't be before `project.start_date` or after today.
   - Approval workflow is sequential — QS can't approve before PM.
4. **DB constraints** — last line of defense:
   - `CHECK (qty > 0)`, `CHECK (status IN (...))`
   - FK constraints with `ON DELETE RESTRICT` on financial records (never cascade-delete bill line items)
   - `UNIQUE` constraints (e.g. one MB per BOQ-item-per-date-range)
   - `numeric(14,2)` for money, `numeric(12,3)` for quantities — never `float`.

Example domain validator:

```python
# domain/measurement/validators.py
class MeasurementValidationError(DomainError):
    pass

def validate_measurement_against_boq(
    measurement_qty: Decimal,
    boq_item: BoqItemSnapshot,
    tolerance_pct: Decimal = Decimal("10"),
) -> None:
    consumed = boq_item.consumed_qty + measurement_qty
    limit = boq_item.tendered_qty * (1 + tolerance_pct / 100)
    if consumed > limit and not boq_item.has_active_variation_order:
        raise MeasurementValidationError(
            f"Quantity {consumed} exceeds tendered {boq_item.tendered_qty} "
            f"by more than {tolerance_pct}% with no Variation Order"
        )
```

Services raise these **before** committing; exceptions map to structured `422` responses with a machine-readable `error_code` (e.g. `MB_EXCEEDS_TOLERANCE`) — frontend branches on the code, not the message string.

## 6. Mobile Field-Entry Design

**Decision:** online-only (no offline queue), delivered as a **responsive PWA** — same React + Ant Design codebase serves both the desktop admin dashboard and mobile field-entry screens. No separate native app/codebase.

- **Two UI experiences, one codebase**: `features/field/` holds simplified, mobile-first, one-task-per-screen flows (Today's DPR → Materials Used → Machinery Used → Workers → Measurements). `features/{boq,billing,projects,...}` holds the dense desktop views. Route by role after login.
- **PWA setup**: `vite-plugin-pwa` for manifest + service worker (app-shell caching only — no offline data queue since data entry is online-only). Manifest uses standalone display mode, portrait orientation for field forms.
- **Camera + GPS**: `<input type="file" accept="image/*" capture="environment">` or `getUserMedia` for photo capture; `navigator.geolocation.getCurrentPosition()` to geotag photos/measurements at submission time (`lat/lng/accuracy/timestamp` stored in `project_photos`). Upload to S3/MinIO immediately on capture, with a visible "weak signal, retrying" state and submit retry — not a full offline queue, but resilient to flaky connections.
- **Measurement entry**: supervisor picks Work Type (Excavation / RCC / Road / Brickwork / Plastering / Pipe laying) → form renders only the relevant dimension fields per the formula defined in the Measurement Sheet Designer. `formulaEngine.ts` computes quantity live on-device and is shared between the desktop designer's preview and the mobile entry form (no duplicated logic). Server always re-validates via `domain/measurement/calculators.py` — mobile compute is UX-only, never trusted.

## 7. Theming (Dark / Light)

- Implemented via Ant Design's `ConfigProvider` + `theme.algorithm` (`theme.defaultAlgorithm` / `theme.darkAlgorithm`).
- `themeStore.ts` (Zustand, persisted to `localStorage`) holds the active mode; toggled from a header switch available on both desktop and field views.
- Respect `prefers-color-scheme` as the initial default, then let the user override.
- All custom components consume theme tokens (`useToken()`), no hardcoded colors — ensures field-entry screens (often used outdoors/bright sunlight, or at night on-site) remain legible in either mode.

## 8. Cross-Cutting Enterprise Concerns

- **Audit trail**: every mutation on `measurements`, `boq_items`, `billing` writes an `audit_log` row (actor, before/after JSONB diff, timestamp) in the same transaction — required for disputes on government measurements.
- **Approval workflow as an explicit state machine**: `DRAFT → SUBMITTED → PM_APPROVED → QS_APPROVED → LOCKED`, transitions enforced in `domain/measurement/workflow.py`, illegal jumps rejected.
- **Soft delete + versioning** on measurements — never hard-delete approved MB entries; audits need full history.
- **RBAC via dependency injection**: `require_role("PM", "QS")` as a FastAPI dependency, not scattered `if user.role ==` checks in handlers.
- **Idempotency keys** on bill-generation endpoints — prevents duplicate bills from retries/double-clicks.
- **Structured error responses**: global exception handler returns a consistent `{code, message, field_errors}` shape.
- **Pagination/filtering** on all list endpoints from day one — BOQ/DPR/expense tables grow fast.

## 9. Database Tables (Overview)

Full table-by-table schema with columns, FKs, and constraints lives in
[`docs/DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md). Summary by module:

```
Tier 1 — Master Data
  departments, users, uom_master, work_type_master, material_master,
  machinery_master, worker_category_master, expense_category_master,
  stock_locations, projects, workers, boq_items, variation_orders

Tier 2 — Transactions
  dpr_headers, dpr_work_items, dpr_issues, dpr_materials, dpr_machinery
  attendance_records
  measurements, measurement_approvals
  material_indents, material_indent_items, material_issues, material_receipts
  expenses
  running_bills, running_bill_items, payments_received
  project_photos, audit_log
```

Material flow is an **internal stock request**, not procurement: an Indent
is fulfilled either from the Head Office store or by transfer from another
site (`source_type` + `source_location_id` on `material_indents`), tracked
through `material_issues`/`material_receipts` — no PO, no vendor, no
invoice. Attendance is per named `worker` with mandatory photo + GPS on each
`attendance_record`, geofence-checked against the project's site
coordinates — feeding DPR/productivity only, no wage calculation.
