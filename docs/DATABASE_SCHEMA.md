# Database Schema — Master & Transaction Tables

Companion to [`ARCHITECTURE.md`](ARCHITECTURE.md). Every table lists columns,
types, foreign keys, and constraints. `numeric` is always used for money/qty
(never `float`). All tables get `id uuid pk default gen_random_uuid()`,
`created_at timestamptz default now()` unless noted; `updated_at` is listed
explicitly where rows are mutable.

Naming convention: Tier 1 = master/reference data (slow-changing, looked up
by transactions). Tier 2 = transactional records (created continuously,
reference Tier 1 rows by FK).

---

## Tier 1 — Master Data

### `departments`
| Column | Type | Constraints |
|---|---|---|
| name | varchar(255) | not null, unique |
| code | varchar(20) | not null, unique |
| is_active | boolean | not null, default true |

Government department issuing the tender (PWD, Irrigation, Water Authority, Municipality, Smart City...).

### `users`
| Column | Type | Constraints |
|---|---|---|
| full_name | varchar(255) | not null |
| email | varchar(255) | not null, unique |
| phone | varchar(20) | unique, nullable |
| hashed_password | varchar(255) | not null |
| role | enum | not null — `SITE_ENGINEER, PROJECT_MANAGER, QUANTITY_SURVEYOR, STORE_KEEPER, ADMIN` |
| is_active | boolean | not null, default true |

`STORE_KEEPER` is the role that fulfills material indents from the Head Office store.

### `uom_master` (Unit of Measure)
| Column | Type | Constraints |
|---|---|---|
| code | varchar(20) | not null, unique — `M3, M2, RM, KG, BAG, TON, NOS` |
| name | varchar(100) | not null |

### `work_type_master` (drives the Measurement Sheet Designer)
| Column | Type | Constraints |
|---|---|---|
| code | varchar(50) | not null, unique — `EARTHWORK, RCC, ROAD, BRICKWORK, PLASTERING, PIPE_LAYING` |
| name | varchar(255) | not null |
| dimension_fields | jsonb | not null — ordered array, e.g. `["length","width","depth"]` |
| formula | varchar(20) | not null — `PRODUCT` (multiply all dims) or `AREA_LH` or `LENGTH_ONLY`; keeps the formula set closed and validated server-side rather than a free-form expression string |
| output_uom_id | uuid | FK → `uom_master.id`, `ON DELETE RESTRICT`, not null |
| is_active | boolean | not null, default true |

CHECK: `jsonb_array_length(dimension_fields) BETWEEN 1 AND 4`.

### `material_master`
| Column | Type | Constraints |
|---|---|---|
| code | varchar(50) | not null, unique |
| name | varchar(255) | not null — Cement OPC, TMT 12mm, Sand, Tiles 600 |
| default_uom_id | uuid | FK → `uom_master.id`, `ON DELETE RESTRICT`, not null |
| category | varchar(100) | nullable |
| is_active | boolean | not null, default true |

### `machinery_master`
| Column | Type | Constraints |
|---|---|---|
| code | varchar(50) | not null, unique |
| name | varchar(255) | not null — JCB, Roller, Excavator |
| is_active | boolean | not null, default true |

### `worker_category_master`
| Column | Type | Constraints |
|---|---|---|
| code | varchar(50) | not null, unique |
| name | varchar(100) | not null — Mason, Helper, Carpenter, Bar Bender |

### `expense_category_master`
| Column | Type | Constraints |
|---|---|---|
| code | varchar(50) | not null, unique |
| name | varchar(100) | not null — Labour, Machinery, Material, Fuel, Transport, Food, Accommodation, Misc |

### `stock_locations` (Head Office store + each project's site store)
| Column | Type | Constraints |
|---|---|---|
| name | varchar(255) | not null |
| location_type | enum | not null — `HEAD_OFFICE, SITE` |
| project_id | uuid | FK → `projects.id`, `ON DELETE RESTRICT`, nullable |
| is_active | boolean | not null, default true |

CHECK: `(location_type = 'HEAD_OFFICE' AND project_id IS NULL) OR (location_type = 'SITE' AND project_id IS NOT NULL)`.

### `projects`
| Column | Type | Constraints |
|---|---|---|
| department_id | uuid | FK → `departments.id`, `ON DELETE RESTRICT`, not null |
| name | varchar(255) | not null |
| tender_no | varchar(100) | not null, unique |
| agreement_no | varchar(100) | nullable |
| contract_value | numeric(14,2) | not null, CHECK > 0 |
| start_date | date | not null |
| completion_date | date | not null, CHECK `completion_date > start_date` |
| site_engineer_id | uuid | FK → `users.id`, `ON DELETE SET NULL`, nullable |
| project_manager_id | uuid | FK → `users.id`, `ON DELETE SET NULL`, nullable |
| site_latitude | numeric(9,6) | nullable |
| site_longitude | numeric(9,6) | nullable |
| geofence_radius_meters | integer | not null, default 500 |
| status | enum | not null, default `ACTIVE` — `ACTIVE, COMPLETED, SUSPENDED` |
| updated_at | timestamptz | not null |

### `workers` (named worker master, per site — feeds Attendance)
| Column | Type | Constraints |
|---|---|---|
| project_id | uuid | FK → `projects.id`, `ON DELETE RESTRICT`, not null |
| worker_category_id | uuid | FK → `worker_category_master.id`, `ON DELETE RESTRICT`, not null |
| full_name | varchar(255) | not null |
| phone | varchar(20) | nullable |
| photo_url | varchar(500) | nullable — enrollment photo |
| contractor_name | varchar(255) | nullable — reference only, no billing |
| is_active | boolean | not null, default true |
| updated_at | timestamptz | not null |

UNIQUE `(project_id, phone)` where `phone IS NOT NULL`.

### `boq_items`
| Column | Type | Constraints |
|---|---|---|
| project_id | uuid | FK → `projects.id`, `ON DELETE RESTRICT`, not null |
| work_type_id | uuid | FK → `work_type_master.id`, `ON DELETE RESTRICT`, not null |
| item_no | varchar(50) | not null |
| description | varchar(500) | not null |
| uom_id | uuid | FK → `uom_master.id`, `ON DELETE RESTRICT`, not null |
| tendered_qty | numeric(14,3) | not null, CHECK > 0 |
| consumed_qty | numeric(14,3) | not null, default 0, CHECK >= 0 |
| rate | numeric(14,2) | not null, CHECK >= 0 |
| has_active_variation_order | boolean | not null, default false — maintained by the service layer when a `variation_order` is approved/superseded |
| updated_at | timestamptz | not null |

UNIQUE `(project_id, item_no)`.

### `variation_orders`
| Column | Type | Constraints |
|---|---|---|
| boq_item_id | uuid | FK → `boq_items.id`, `ON DELETE RESTRICT`, not null |
| vo_number | varchar(50) | not null |
| additional_qty | numeric(14,3) | not null, CHECK > 0 |
| reason | text | not null |
| approved_by | uuid | FK → `users.id`, `ON DELETE RESTRICT`, not null |
| approved_at | timestamptz | not null |
| status | enum | not null, default `ACTIVE` — `ACTIVE, SUPERSEDED` |

UNIQUE `(boq_item_id, vo_number)`.

---

## Tier 2 — Transactions

### `dpr_headers`
| Column | Type | Constraints |
|---|---|---|
| project_id | uuid | FK → `projects.id`, `ON DELETE RESTRICT`, not null |
| report_date | date | not null |
| weather | varchar(100) | nullable |
| submitted_by | uuid | FK → `users.id`, `ON DELETE RESTRICT`, not null |
| submitted_at | timestamptz | nullable |
| status | enum | not null, default `DRAFT` — `DRAFT, SUBMITTED` |
| updated_at | timestamptz | not null |

UNIQUE `(project_id, report_date)`. Domain validator (not DB-enforceable across sessions): `report_date <= today()` and `report_date >= project.start_date`.

### `dpr_work_items`
| Column | Type | Constraints |
|---|---|---|
| dpr_header_id | uuid | FK → `dpr_headers.id`, `ON DELETE CASCADE`, not null |
| boq_item_id | uuid | FK → `boq_items.id`, `ON DELETE RESTRICT`, not null |
| qty_today | numeric(12,3) | not null, CHECK > 0 |
| notes | varchar(500) | nullable |

### `dpr_issues` (blockers)
| Column | Type | Constraints |
|---|---|---|
| dpr_header_id | uuid | FK → `dpr_headers.id`, `ON DELETE CASCADE`, not null |
| description | varchar(1000) | not null |
| severity | enum | not null — `LOW, MEDIUM, HIGH, CRITICAL` |
| owner_user_id | uuid | FK → `users.id`, `ON DELETE SET NULL`, nullable |
| status | enum | not null, default `OPEN` — `OPEN, RESOLVED` |
| photo_url | varchar(500) | nullable |
| updated_at | timestamptz | not null |

### `dpr_materials` (consumption logged against BOQ — distinct from stock movement)
| Column | Type | Constraints |
|---|---|---|
| dpr_header_id | uuid | FK → `dpr_headers.id`, `ON DELETE CASCADE`, not null |
| material_id | uuid | FK → `material_master.id`, `ON DELETE RESTRICT`, not null |
| qty_consumed | numeric(14,3) | not null, CHECK > 0 |
| uom_id | uuid | FK → `uom_master.id`, `ON DELETE RESTRICT`, not null |

### `dpr_machinery`
| Column | Type | Constraints |
|---|---|---|
| dpr_header_id | uuid | FK → `dpr_headers.id`, `ON DELETE CASCADE`, not null |
| machinery_id | uuid | FK → `machinery_master.id`, `ON DELETE RESTRICT`, not null |
| hours_used | numeric(5,2) | not null, CHECK > 0 AND <= 24 |

### `attendance_records`
| Column | Type | Constraints |
|---|---|---|
| project_id | uuid | FK → `projects.id`, `ON DELETE RESTRICT`, not null |
| worker_id | uuid | FK → `workers.id`, `ON DELETE RESTRICT`, not null |
| attendance_date | date | not null |
| check_in_time | timestamptz | not null |
| photo_url | varchar(500) | not null — proof, mandatory |
| latitude | numeric(9,6) | not null |
| longitude | numeric(9,6) | not null |
| gps_accuracy_meters | numeric(6,2) | nullable |
| within_geofence | boolean | not null — computed server-side via haversine distance vs `project.site_latitude/longitude` |
| marked_by | uuid | FK → `users.id`, `ON DELETE RESTRICT`, not null |

UNIQUE `(worker_id, attendance_date)` — one check-in per worker per day. No wage fields — attendance is informational/DPR input only.

### `measurements` (Measurement Book entries)
| Column | Type | Constraints |
|---|---|---|
| project_id | uuid | FK → `projects.id`, `ON DELETE RESTRICT`, not null |
| boq_item_id | uuid | FK → `boq_items.id`, `ON DELETE RESTRICT`, not null |
| work_type_id | uuid | FK → `work_type_master.id`, `ON DELETE RESTRICT`, not null — snapshot at entry time |
| measurement_date | date | not null |
| dimensions | jsonb | not null — keys match `work_type.dimension_fields` |
| computed_qty | numeric(14,3) | not null, CHECK > 0 — always server-recomputed from `dimensions`, client value never trusted |
| status | enum | not null, default `DRAFT` — `DRAFT, SUBMITTED, PM_APPROVED, QS_APPROVED, LOCKED, REJECTED` |
| recorded_by | uuid | FK → `users.id`, `ON DELETE RESTRICT`, not null |
| version | integer | not null, default 1 |
| superseded_by_id | uuid | FK → `measurements.id`, `ON DELETE SET NULL`, nullable (self-ref; points to the amending version) |
| billed | boolean | not null, default false — set true once included in a `running_bill_item`, prevents double-billing |
| updated_at | timestamptz | not null |

LOCKED rows are immutable at the service layer — amendments create a new row and set `superseded_by_id` on the old one (never UPDATE a LOCKED row, never hard-delete an approved one).

### `measurement_approvals` (append-only audit trail)
| Column | Type | Constraints |
|---|---|---|
| measurement_id | uuid | FK → `measurements.id`, `ON DELETE CASCADE`, not null |
| from_status | varchar(30) | not null |
| to_status | varchar(30) | not null |
| acted_by | uuid | FK → `users.id`, `ON DELETE RESTRICT`, not null |
| remarks | varchar(500) | nullable |
| acted_at | timestamptz | not null, default now() |

### `material_indents` (stock request header — internal, no procurement)
| Column | Type | Constraints |
|---|---|---|
| requesting_project_id | uuid | FK → `projects.id`, `ON DELETE RESTRICT`, not null |
| source_type | enum | not null — `HEAD_OFFICE, SITE_TRANSFER` |
| source_location_id | uuid | FK → `stock_locations.id`, `ON DELETE RESTRICT`, not null |
| requested_by | uuid | FK → `users.id`, `ON DELETE RESTRICT`, not null |
| status | enum | not null, default `DRAFT` — `DRAFT, SUBMITTED, APPROVED, REJECTED, ISSUED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED` |
| approved_by | uuid | FK → `users.id`, `ON DELETE SET NULL`, nullable |
| approved_at | timestamptz | nullable |
| needed_by_date | date | nullable |
| updated_at | timestamptz | not null |

Domain validator: `source_location.location_type` must match `source_type` (cross-table rule, enforced in `domain/material/validators.py`, not a DB constraint).

### `material_indent_items`
| Column | Type | Constraints |
|---|---|---|
| material_indent_id | uuid | FK → `material_indents.id`, `ON DELETE CASCADE`, not null |
| material_id | uuid | FK → `material_master.id`, `ON DELETE RESTRICT`, not null |
| uom_id | uuid | FK → `uom_master.id`, `ON DELETE RESTRICT`, not null |
| requested_qty | numeric(14,3) | not null, CHECK > 0 |
| issued_qty | numeric(14,3) | not null, default 0, CHECK >= 0 |
| received_qty | numeric(14,3) | not null, default 0, CHECK >= 0 |
| updated_at | timestamptz | not null |

CHECK: `issued_qty <= requested_qty`. CHECK: `received_qty <= issued_qty`.

### `material_issues` (fulfillment ledger — append only)
| Column | Type | Constraints |
|---|---|---|
| material_indent_item_id | uuid | FK → `material_indent_items.id`, `ON DELETE RESTRICT`, not null |
| issued_qty | numeric(14,3) | not null, CHECK > 0 |
| issued_by | uuid | FK → `users.id`, `ON DELETE RESTRICT`, not null |
| issued_at | timestamptz | not null, default now() |
| vehicle_ref | varchar(100) | nullable |

### `material_receipts` (site confirmation ledger — append only)
| Column | Type | Constraints |
|---|---|---|
| material_indent_item_id | uuid | FK → `material_indent_items.id`, `ON DELETE RESTRICT`, not null |
| received_qty | numeric(14,3) | not null, CHECK > 0 |
| received_by | uuid | FK → `users.id`, `ON DELETE RESTRICT`, not null |
| received_at | timestamptz | not null, default now() |
| photo_url | varchar(500) | nullable |
| remarks | varchar(500) | nullable |

### `expenses`
| Column | Type | Constraints |
|---|---|---|
| project_id | uuid | FK → `projects.id`, `ON DELETE RESTRICT`, not null |
| expense_category_id | uuid | FK → `expense_category_master.id`, `ON DELETE RESTRICT`, not null |
| amount | numeric(14,2) | not null, CHECK > 0 |
| expense_date | date | not null |
| vendor_name | varchar(255) | nullable — free text, reference only, not a FK |
| paid_by | uuid | FK → `users.id`, `ON DELETE RESTRICT`, not null |
| bill_photo_url | varchar(500) | nullable |
| remarks | varchar(500) | nullable |
| updated_at | timestamptz | not null |

### `running_bills` (bill to the client/government — not a vendor bill)
| Column | Type | Constraints |
|---|---|---|
| project_id | uuid | FK → `projects.id`, `ON DELETE RESTRICT`, not null |
| bill_number | varchar(50) | not null |
| bill_date | date | not null |
| from_date | date | not null |
| to_date | date | not null, CHECK `to_date >= from_date` |
| total_amount | numeric(16,2) | not null, default 0, CHECK >= 0 — maintained by service from line items |
| status | enum | not null, default `DRAFT` — `DRAFT, SUBMITTED, APPROVED, PAID` |
| idempotency_key | varchar(100) | not null, unique — prevents duplicate generation on retry |
| generated_by | uuid | FK → `users.id`, `ON DELETE RESTRICT`, not null |
| updated_at | timestamptz | not null |

UNIQUE `(project_id, bill_number)`.

### `running_bill_items`
| Column | Type | Constraints |
|---|---|---|
| running_bill_id | uuid | FK → `running_bills.id`, `ON DELETE CASCADE`, not null |
| measurement_id | uuid | FK → `measurements.id`, `ON DELETE RESTRICT`, not null — must have `status = LOCKED` and `billed = false` at insert time (service-enforced) |
| boq_item_id | uuid | FK → `boq_items.id`, `ON DELETE RESTRICT`, not null |
| billed_qty | numeric(14,3) | not null, CHECK > 0 |
| rate | numeric(14,2) | not null, CHECK >= 0 — snapshot of `boq_item.rate` at billing time |
| amount | numeric(16,2) | not null, CHECK >= 0 — `billed_qty * rate`, computed at write time |

UNIQUE `(running_bill_id, measurement_id)` — and a measurement can appear in at most one bill across the whole system (enforced via the `measurements.billed` flag, since the uniqueness spans tables).

### `payments_received` (from client/government — not vendor payments)
| Column | Type | Constraints |
|---|---|---|
| running_bill_id | uuid | FK → `running_bills.id`, `ON DELETE RESTRICT`, not null |
| amount_received | numeric(16,2) | not null, CHECK > 0 |
| received_date | date | not null |
| reference_no | varchar(100) | nullable — cheque/UTR number |
| recorded_by | uuid | FK → `users.id`, `ON DELETE RESTRICT`, not null |

Domain validator: `SUM(amount_received) FOR running_bill_id <= running_bills.total_amount` (aggregate rule, enforced in service layer before insert).

### `project_photos` (polymorphic attachment)
| Column | Type | Constraints |
|---|---|---|
| entity_type | enum | not null — `DPR_ISSUE, MEASUREMENT, MATERIAL_RECEIPT, ATTENDANCE` |
| entity_id | uuid | not null — polymorphic reference; no DB-level FK possible across multiple tables, validated in the domain layer against the matching table for `entity_type` |
| photo_url | varchar(500) | not null |
| latitude | numeric(9,6) | nullable |
| longitude | numeric(9,6) | nullable |
| captured_at | timestamptz | not null |
| uploaded_by | uuid | FK → `users.id`, `ON DELETE RESTRICT`, not null |

### `audit_log` (append only, system-wide)
| Column | Type | Constraints |
|---|---|---|
| entity_type | varchar(50) | not null |
| entity_id | uuid | not null |
| action | enum | not null — `CREATE, UPDATE, DELETE, STATUS_CHANGE` |
| actor_id | uuid | FK → `users.id`, `ON DELETE RESTRICT`, not null |
| before_data | jsonb | nullable |
| after_data | jsonb | nullable |

---

## Cross-Table Rules Not Expressible as a Single-Table CHECK

These live in `domain/*/validators.py` and run inside the service layer before commit:

1. **Measurement vs BOQ tolerance**: `measurements.computed_qty` + `boq_items.consumed_qty` must not exceed `boq_items.tendered_qty * 1.10` unless an `ACTIVE` `variation_orders` row exists for that `boq_item_id`.
2. **Measurement approval sequence**: `measurements.status` transitions only via `SUBMITTED → PM_APPROVED → QS_APPROVED → LOCKED`; QS cannot approve before PM (state machine in `domain/measurement/workflow.py`).
3. **Indent fulfillment location match**: `material_indents.source_location_id.location_type` must equal `source_type`.
4. **Indent quantity ladder**: `material_indent_items.issued_qty <= requested_qty` and `received_qty <= issued_qty`, enforced both as a DB CHECK and re-validated in the service before each issue/receipt insert (since each is built from a running sum of `material_issues`/`material_receipts`).
5. **Attendance geofence**: `attendance_records.within_geofence` is computed (not client-supplied) from haversine distance between the check-in lat/lng and `projects.site_latitude/longitude`, flagged `false` if outside `geofence_radius_meters` — recorded either way (visibility over blocking), surfaced to PM for review.
6. **No double-billing**: a `measurements` row can be referenced by at most one `running_bill_items` row; service checks `measurements.billed = false` before insert and sets it `true` in the same transaction.
7. **DPR date bounds**: `dpr_headers.report_date` must be between `project.start_date` and today (cannot backdate before project start, cannot future-date).
8. **Payment cap**: cumulative `payments_received.amount_received` for a `running_bill_id` cannot exceed `running_bills.total_amount`.
