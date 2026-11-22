# RHCM — Dental Clinic & Charity Trust Management System
## System Architecture

Status: design baseline for Stage 1 onward. This document is the reference
for database relationships, business workflows, and navigation structure
before any stage is implemented. Each stage's section is extended (not
rewritten) as it ships.

---

## 1. Goals & Non-Negotiables

- Two legally separate entities (Main Clinic, Charity Trust) sharing one
  application, with hard data isolation between them.
- Real backend behind every screen: PostgreSQL, authorization checks,
  transactions. No screen is "done" without a working API and persisted
  data behind it.
- All timestamps stored in UTC; every screen renders IST
  (`Asia/Kolkata`). Conversion happens at the edges (API serialization /
  UI formatting), never in business logic.
- All money stored as `Decimal` / integer-paise, never `float`. INR
  formatting only at render time.
- Server-side authorization on every mutating and sensitive read
  endpoint — the UI hiding a button is a UX nicety, not a security
  control.

---

## 2. Technology Stack & Monorepo Layout

```
rhcm/
├── apps/
│   ├── web/          Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui, PWA
│   └── api/           NestJS, TypeScript, REST, session auth
├── packages/
│   ├── database/       Prisma schema, migrations, seed scripts, generated client
│   ├── shared/          Shared TS types/enums/DTOs/zod schemas used by both apps
│   └── config/          Shared eslint/tsconfig/prettier base configs
├── docker-compose.yml  Postgres + MinIO (S3-compatible, local dev) + Redis (sessions)
├── docs/
│   └── ARCHITECTURE.md (this file)
└── package.json         npm workspaces root
```

- **Why NestJS + separate Next.js app, not Next.js API routes:** the spec
  calls for a REST backend with its own module boundaries, guards, and
  interceptors (audit logging, entity-scoping) applied uniformly — Nest's
  DI/module system and guard pipeline are built for exactly that, and it
  keeps business logic out of the web app entirely (the web app is a
  thin, replaceable client of the API).
- **Session auth, not JWT:** session-based auth (Redis-backed sessions,
  httpOnly secure cookies) was explicitly requested, and it also gives us
  server-side session revocation (forced logout, timeout, "log out all
  devices") for free, which stateless JWTs don't.
- **Prisma** is the single source of truth for the schema; both the
  NestJS API and any scripts/seed tooling import the generated client
  from `packages/database`.
- **File storage:** S3-compatible object storage (MinIO locally, AWS S3
  or equivalent in production), private bucket, access only via
  short-lived signed URLs issued by the API after an authorization
  check — never a public bucket URL.

---

## 3. Multi-Entity Architecture

### 3.1 Model

`entities` is the root of the tenancy model:

| id | code | name | chairs | ots |
|----|------|------|--------|-----|
| 1 | CLINIC | Main Dental Clinic | 10 | 2 |
| 2 | TRUST | Charity Trust | 3 | 0 |

Every entity-scoped table carries a non-nullable `entity_id` FK. This
includes: `appointments`, `visits`, `estimates`, `invoices`, `receipts`,
`payment_allocations`, `credit_notes`, `refunds`, `clinic_resources`,
`doctor_availability` (per-entity, since a doctor's clinic hours and
trust hours differ), `treatment_catalog` (an entity *may* reuse items
but pricing is entity-specific, so pricing lives on an entity-scoped
`entity_treatment_price` override, see §5.9), and `audit_logs`.

`patients` is **not** entity-owned — a person is a person. Instead:

- `patient_entity_links` records which entities a given `patients` row
  has a relationship with (i.e. has at least one visit/registration at),
  plus a `linked_by`, `linked_at`, and `link_reason` for audit.
- Clinical, financial, and visit data (`visits`, `invoices`, etc.) are
  entity-scoped and reference `patient_id` directly, but every query
  that returns them is filtered by the requesting user's accessible
  `entity_id` set — the link table is what *authorizes* cross-entity
  identity matching during check-in search, not what gates ordinary
  reads.
- Matching a Trust patient to an existing Clinic patient during check-in
  (§6.2) requires a `cross_entity_link` permission and writes a
  `consent_records` row (purpose: `cross_entity_identity_linking`)
  before the link is created — this satisfies "requires appropriate
  authorization and privacy policy" from the spec. Without that
  permission, the receptionist sees "possible match in another entity"
  with no identifying details, and must escalate to someone who holds
  the permission.

### 3.2 Enforcement

Entity isolation is enforced in **one place**: a Nest `EntityScopeGuard`
+ a Prisma query middleware that injects `entity_id IN (:accessibleEntityIds)`
into every entity-scoped repository call, derived from the authenticated
user's `user_entity_access` rows (plus a `cross_entity_report_access`
permission for Management users who need combined reports). Controllers
never hand-roll entity filtering — this prevents the classic bug where
one forgotten endpoint leaks another entity's data.

Invoices and payment allocations additionally get a **database-level**
guard: a Postgres trigger (or Prisma extension executed in the same
transaction) rejects an `invoice_payment_allocations` insert where the
invoice's `entity_id` differs from the receipt's `entity_id`. Defense in
depth — the application layer should never produce this, but the
constraint makes it structurally impossible, matching "prevent
cross-entity invoice or payment allocation" as a hard requirement, not
just a code review concern.

### 3.3 Staff shared across entities

`user_entity_access(user_id, entity_id, role_id)` is the join table.
A doctor/staff member can have a row for CLINIC, TRUST, or both, each
with its own role (e.g. "Doctor" at the Clinic, "Doctor" at the Trust
too, or a Clinic Admin who is only a plain Doctor at the Trust). The
active-entity switcher in the UI (§8.1) only ever lists entities present
in the signed-in user's `user_entity_access`.

---

## 4. Identity, Roles & Permissions

### 4.1 Model

- `permissions`: fine-grained, string-coded (`patient.read`,
  `invoice.void`, `payment.allocate`, `report.cross_entity`,
  `appointment.override_conflict`, `clinical.prescribe`, ...).
- `roles`: named bundles (the 10 spec roles ship as seeded, non-deletable
  "system roles"; admins can clone one into a custom role).
- `role_permissions`: join table.
- `user_entity_access(user_id, entity_id, role_id)`: a user's role is
  **per entity** — the same login can be Clinic Admin at the Clinic and
  have no access at all at the Trust.
- Doctor-specific clinical permissions (e.g. `clinical.prescribe`,
  `clinical.plan_treatment`, `clinical.perform_ot`) are ordinary
  permissions attached to the Doctor/Consultant role, not a separate
  mechanism — keeps one permission model instead of two.

### 4.2 Seeded system roles

| Role | Typical permission bundle |
|---|---|
| Super Administrator | all permissions, all entities, including user/role management and cross-entity reporting |
| Clinic Administrator | full admin within the Main Clinic entity only |
| Trust Administrator | full admin within the Charity Trust entity only |
| Receptionist | patient registration, check-in, appointment booking, estimate creation |
| Doctor / Consultant | clinical module, own-patient dashboard, treatment planning/performing, prescriptions |
| Nurse / Dental Assistant | visit support, clinical note co-entry (no diagnosis/prescription authority), OT assist |
| OT Staff | OT scheduling, checklists, operative notes |
| Billing Executive | estimates, invoices, no payment posting |
| Accountant | receipts, payment allocation, refunds, financial reports |
| Management / Reporting User | read-only reports, optionally cross-entity |

### 4.3 AuthN

- Argon2id password hashing, configurable password policy.
- Session cookie: httpOnly, `Secure`, `SameSite=Lax`, server session
  store in Redis with sliding expiration (idle timeout) + absolute
  max-age; "log out everywhere" revokes by user id.
- TOTP-based MFA, mandatory for Super Admin / Clinic Admin / Trust Admin
  / Accountant roles (configurable), optional elsewhere.
- No seeded admin password: first-run bootstrap requires either an
  interactive CLI prompt (`pnpm bootstrap:admin`) that sets a password
  immediately, or an invite-link flow (token emailed, expires, user sets
  their own password on first login) — never a fixed default credential
  in code, migration, or seed data.
- Every login attempt (success/failure), password reset, MFA
  challenge, and permission-denied event writes to `audit_logs`.

---

## 5. Database Design

Full table list from the spec, with the relationships and constraints
that make the business rules actually hold (not just a field list).
Stage column shows when each table is migrated; later stages add
columns to earlier tables where noted rather than duplicating tables.

### 5.1 Tenancy & identity (Stage 1)

- **entities**(id, code UNIQUE, legal_name, display_name, timezone default
  'Asia/Kolkata', currency default 'INR', is_active, created_at)
- **entity_settings**(id, entity_id FK UNIQUE, branding_json, invoice_prefix,
  invoice_next_seq, receipt_prefix, receipt_next_seq, estimate_prefix,
  estimate_next_seq, gstin, default_tax_profile_id, address, contact)
  — one row per entity; numbering counters live here so invoice/receipt/
  estimate numbers are generated inside the same DB transaction as the
  document (`SELECT ... FOR UPDATE` on this row), guaranteeing no gaps
  are visible and no duplicates are possible under concurrency.
- **users**(id, email UNIQUE, phone, password_hash, mfa_secret_encrypted,
  mfa_enabled, status[active/disabled], last_login_at, failed_login_count,
  locked_until)
- **roles**(id, entity_id NULLABLE — NULL = system role template usable
  everywhere, name, is_system, created_by)
- **permissions**(id, code UNIQUE, category, description)
- **role_permissions**(role_id FK, permission_id FK, PK(role_id,permission_id))
- **user_entity_access**(id, user_id FK, entity_id FK, role_id FK,
  granted_by, granted_at, UNIQUE(user_id, entity_id, role_id))
- **doctors**(id, user_id FK NULLABLE — a doctor may have no login,
  full_name, registration_number UNIQUE, qualifications_json,
  specialties_json, default_consultation_fee)
- **staff**(id, user_id FK NULLABLE, full_name, designation, employee_code)
- **doctor_availability**(id, doctor_id FK, entity_id FK, weekday,
  start_time, end_time, slot_duration_minutes, effective_from,
  effective_to NULLABLE, is_recurring, break_start/break_end NULLABLE)
  — leave/unavailable dates are a separate
  **doctor_leave**(doctor_id, entity_id, date_from, date_to, reason) so a
  single-day override doesn't require editing the recurring pattern.
- **clinic_resources**(id, entity_id FK, type[chair|ot], number,
  label, is_active, UNIQUE(entity_id, type, number)) — seeded 10 chairs +
  2 OTs for Clinic, 3 chairs for Trust.
- **audit_logs**(id, occurred_at, actor_user_id NULLABLE, entity_id
  NULLABLE, action, resource_type, resource_id, ip_address, user_agent,
  before_json NULLABLE, after_json NULLABLE) — append-only, no update/
  delete grants at the DB role level.

### 5.2 Patients & registration (Stage 2)

- **patients**: permanent record. `uhid` UNIQUE, generated transactionally
  (`entity_settings`-style counter row, or a dedicated `uhid_sequence`
  table locked `FOR UPDATE`) — **never derived from row count**, and
  never reused even if a patient record is later merged/archived.
  Fields: dob, gender, phone, email, address_json, emergency_contact_json,
  guardian_json (for minors), medical_alerts_json, allergies_json,
  medical_history_json, status[active/inactive/deceased/merged].
- **temporary_registrations**: temp_id (its own short human-friendly
  sequence, distinct format from UHID so the two are never confused,
  e.g. `TMP-000123` vs `RD-00001`), name, phone, dob_or_age, gender,
  visit_reason, preferred_doctor_id NULLABLE, entity_id, status
  [open/checked_in/expired/discarded], created_at. On check-in match, it
  gets `matched_patient_id` set and is never deleted — history is kept
  per the retention policy.
- **patient_entity_links**(patient_id, entity_id, first_visit_at,
  UNIQUE(patient_id, entity_id)) — simple "has a relationship here" link,
  distinct from the cross-entity privacy link described in §3.1.
- **consent_records**(id, patient_id FK, entity_id FK, consent_type
  [treatment, data_sharing, cross_entity_identity_linking, photo_video,
  marketing], granted BOOLEAN, granted_at, captured_by, document_ref
  NULLABLE, version) — a new row per consent event, never overwritten,
  so consent history is reconstructable.

### 5.3 Scheduling (Stage 3)

- **appointments**(id, entity_id FK, patient_id FK NULLABLE,
  temporary_registration_id FK NULLABLE — exactly one of the two is set,
  enforced by a CHECK constraint, doctor_id FK, resource_id FK NULLABLE
  (chair/OT), start_at, end_at (UTC, tz-aware), procedure_hint, type
  [consultation/treatment/follow_up/emergency], status, remarks,
  created_by, rescheduled_from_id FK NULLABLE self-reference).
  Overlap prevention: a Postgres **exclusion constraint** using
  `tstzrange(start_at, end_at)` with `btree_gist`, partitioned per
  `(doctor_id)` and separately per `(resource_id)` where not null — this
  rejects overlapping ranges at the database level regardless of
  application bugs or race conditions, which is stronger than a
  check-then-insert in application code. An "authorized override"
  (double-booking an emergency slot) is implemented as a *different*
  write path that requires `appointment.override_conflict` and records
  the override reason in `audit_logs`, re-using the same constraint but
  via a deferred-constraint + explicit resolution rather than disabling
  it ad hoc.
- Status lifecycle is an explicit allowed-transitions table in code
  (mirroring the existing Django app's approach, which worked well):
  Booked → Confirmed → Arrived → Checked In → Waiting → In Treatment →
  Completed, with Cancelled/No Show/Rescheduled reachable from the
  pre-Completed states only.

### 5.4 Visits (Stage 3/4)

- **visits**(id, visit_number UNIQUE per entity, patient_id FK, entity_id
  FK, appointment_id FK NULLABLE, doctor_id FK, resource_id FK NULLABLE,
  checked_in_at, checked_out_at NULLABLE, chief_complaint, clinical_findings,
  diagnosis_summary, treatment_advice, status, next_appointment_recommended_at
  NULLABLE).

### 5.5 Clinical (Stage 4)

- **diagnoses**(id, visit_id FK, patient_id FK, tooth_number NULLABLE
  (FDI), diagnosis_code, description, diagnosed_by FK doctors, diagnosed_at)
- **dental_chart_entries**(id, patient_id FK, tooth_number FDI,
  dentition[permanent/deciduous], surface NULLABLE, condition, status,
  recorded_at, recorded_by, visit_id FK NULLABLE) — the odontogram is a
  rendered view over the current/latest entry per (patient, tooth,
  surface), with full history retained (append rows, never update in
  place, so "treatment progress over time" is just a query).
- **treatment_catalog**(id, code UNIQUE, name, category, default_duration_minutes,
  default_price, is_active) — global catalog; §5.9 covers per-entity pricing.
- **treatment_plans**(id, patient_id FK, entity_id FK, visit_id FK
  NULLABLE, created_by, status[draft/active/completed/cancelled])
- **treatment_plan_items**(id, treatment_plan_id FK, tooth_number
  NULLABLE, treatment_catalog_id FK, planned_doctor_id FK, quantity,
  estimated_cost, status, sort_order)
- **treatment_sessions**(id = the "Treatment ID" in the spec,
  treatment_plan_item_id FK, visit_id FK NULLABLE, entity_id FK,
  tooth_number, procedure_code, planned_by_doctor_id FK, assigned_doctor_id
  FK, performed_by_doctor_id FK NULLABLE, assisting_staff_ids (join table
  `treatment_session_assistants`), planned_date, actual_date NULLABLE,
  status[planned/in_progress/completed/cancelled], estimated_cost,
  actual_billed_amount NULLABLE, clinical_remarks) — supports multi-session
  procedures because a `treatment_plan_item` (e.g. "Root Canal, tooth 36")
  fans out into N `treatment_sessions` rows over time.
- **clinical_notes**(id, visit_id FK, patient_id FK, authored_by,
  authored_at, note_type, body, is_addendum, supersedes_note_id NULLABLE)
  — clinical notes are append-only; a correction is a new addendum
  row linked to the original, never an edit, for medico-legal integrity.

### 5.6 Estimates (Stage 5)

- **estimates**(id, estimate_number UNIQUE per entity, patient_id FK,
  entity_id FK, visit_id FK NULLABLE, version, supersedes_estimate_id
  NULLABLE self-ref, valid_until, status[draft/sent/accepted/rejected/
  expired/superseded], gross_total, discount_total, tax_total, net_total)
- **estimate_items**(id, estimate_id FK, treatment_plan_item_id FK
  NULLABLE, tooth_number, planned_doctor_id FK, treatment_catalog_id FK,
  quantity, unit_price, discount_amount, tax_profile_id FK, line_total,
  **invoiced_quantity** default 0, **invoiced_amount** default 0) — the
  last two columns are the enforcement mechanism for "never invoice the
  same estimate line twice": every invoice-from-estimate write is a
  single transaction that increments these and a CHECK constraint
  (`invoiced_quantity <= quantity`) makes over-invoicing impossible even
  under concurrent requests.

### 5.7 Invoices (Stage 5)

- **invoices**(id, invoice_number UNIQUE per entity (entity-specific
  numbering via `entity_settings` counter), entity_id FK, patient_id FK,
  visit_id FK NULLABLE, invoice_date, status[draft/issued/partially_paid/
  paid/void], gross_total, discount_total, tax_total, net_total,
  **paid_amount** (denormalized, recomputed from `payment_allocations`
  inside the same transaction as any allocation change — never trusted
  as independently writable), voided_at NULLABLE, void_reason NULLABLE,
  corrected_by_invoice_id NULLABLE self-ref)
- **invoice_items**(id, invoice_id FK, estimate_item_id FK NULLABLE,
  treatment_session_id FK NULLABLE, tooth_number, planned_by_doctor_id,
  performed_by_doctor_id, description, quantity, unit_price,
  discount_amount, tax_profile_id, line_total)
- Posted invoices (status beyond `draft`) are **immutable**: no UPDATE
  grant on `invoice_items` once `invoices.status != 'draft'`; a
  correction is always a **credit_note** or a new corrective invoice
  referencing `corrected_by_invoice_id`, never an UPDATE. This is what
  "immutable posted financial history" means concretely.

### 5.8 Receipts & payment allocation (Stage 5 — the critical module)

- **payments**(id, entity_id FK, patient_id FK, payment_date, amount,
  mode[cash/upi/card/bank_transfer/other], transaction_reference
  NULLABLE, received_by FK users, remarks, idempotency_key UNIQUE
  NULLABLE) — this is the row for "money actually received." A payment
  with no allocations yet is **unallocated patient credit**.
- **receipts**(id, receipt_number UNIQUE per entity, payment_id FK,
  entity_id FK, issued_at, cashier_id FK users, remarks) — a receipt is
  the printable/document representation of a payment; kept as a
  separate table (not merged into `payments`) because a single payment
  could in principle need re-issuing a receipt copy without re-recording
  money movement, and it cleanly separates "what happened financially"
  from "what document was handed over."
- **payment_allocations**(id, payment_id FK, invoice_id FK, amount,
  allocated_at, allocated_by, reversed_at NULLABLE, reversal_reason
  NULLABLE) — the linking table the spec calls for. One payment can fan
  out to many invoices (many rows, same payment_id); one invoice can
  receive partial allocations from many payments over time.
- **credit_notes**(id, entity_id FK, patient_id FK, invoice_id FK
  NULLABLE, amount, reason, issued_by, issued_at, status) — used both
  for invoice corrections and for converting part of a patient's
  unallocated credit into a formal adjustment.
- **refunds**(id, entity_id FK, patient_id FK, payment_id FK NULLABLE,
  amount, reason, approved_by, refunded_at, mode, status
  [requested/approved/completed/rejected]).

**Balance formula**, computed, never stored as an independently editable
column:

```
invoice.balance =
    invoice.net_total
  - SUM(payment_allocations.amount WHERE invoice_id = this AND reversed_at IS NULL)
  - SUM(credit_notes.amount WHERE invoice_id = this AND status = 'applied')
```

**Transaction-safety rules enforced in the service layer, inside a single
DB transaction with row locks (`SELECT ... FOR UPDATE` on the invoice and
payment rows) per allocation request:**

1. `SUM(allocations for this payment) <= payment.amount` — can't
   allocate more than was received.
2. `SUM(allocations for this invoice, unreversed) <= invoice.net_total` —
   can't overpay an invoice (a CHECK constraint backs this up too).
3. `payment.entity_id == invoice.entity_id` — enforced by a FK + trigger
   as described in §3.2, not just application logic.
4. Duplicate receipt prevention: the create-payment endpoint requires a
   client-generated `idempotency_key`; a retried request with the same
   key returns the original payment/receipt instead of creating a
   second one (unique index on `idempotency_key` + upsert-style handling).
5. Reversal never deletes a `payment_allocations` row — it sets
   `reversed_at`/`reversal_reason`, so the full history (original
   allocation + its reversal) stays queryable, and `audit_logs` records
   who/when/why.

### 5.9 Supporting tables

- **entity_treatment_price**(entity_id FK, treatment_catalog_id FK,
  price, PK(entity_id, treatment_catalog_id)) — lets the Trust price a
  procedure differently (often subsidized) from the Clinic without
  forking the catalog.
- **tax_profiles**(id, entity_id FK, name, rate, components_json) and
  invoice/estimate items reference `tax_profile_id` — supports GST-style
  split (CGST/SGST) without hardcoding a single rate.
- **patient_documents**(id, patient_id FK, entity_id FK, visit_id FK
  NULLABLE, treatment_session_id FK NULLABLE, category, storage_key
  (private bucket key, never a public URL), mime_type, size_bytes,
  uploaded_by, uploaded_at, scan_status[pending/clean/infected/error],
  retention_until NULLABLE, deleted_at NULLABLE soft-delete).
- **ot_bookings**(id, entity_id FK, resource_id FK (type=ot), patient_id
  FK, operating_doctor_id FK, planned_start, planned_end,
  actual_start/actual_end NULLABLE, preop_checklist_json,
  consent_record_id FK, operative_notes, postop_instructions,
  recovery_status) — reuses the same exclusion-constraint pattern as
  appointments for the OT resource.

### 5.10 Indexing & constraints summary

- Every `entity_id` column is indexed; every entity-scoped table has a
  composite index leading with `entity_id` for the common "this
  entity's X" queries.
- Every human-facing number (`uhid`, `invoice_number`, `receipt_number`,
  `estimate_number`, `visit_number`, `temp_id`) is `UNIQUE` and generated
  from a row-locked counter, never `COUNT(*) + 1`.
- Money columns are `NUMERIC(12,2)` (paise-level precision for INR);
  application code uses a Decimal library end-to-end — JS `number` never
  touches a money value.
- All timestamp columns are `timestamptz`, stored in UTC; `Asia/Kolkata`
  conversion happens only at the API→UI boundary (date-fns-tz on the
  frontend, or `Intl` formatting with explicit TZ).

---

## 6. Core Business Workflows

### 6.1 Temporary registration → appointment

1. Reception captures a `temporary_registrations` row (name, phone,
   dob/age, gender, reason, preferred doctor) — can be saved incomplete.
2. An appointment can reference `temporary_registration_id` directly
   (no UHID needed yet).

### 6.2 Check-in → permanent UHID

1. Reception searches by UHID / temp ID / name / phone. Fuzzy name +
   exact phone match surfaces "possible duplicates" ranked by match
   confidence (phone exact = highest).
2. If a genuine match is confirmed: the visit is created against the
   existing `patients.id`; the `temporary_registrations` row is updated
   with `matched_patient_id` (never deleted).
3. If genuinely new: a new `patients` row is created transactionally
   with a freshly locked `uhid` sequence value, a `patient_entity_links`
   row for the current entity, and the temp registration is linked to it.
4. A cross-entity match (the phone/name matches a patient who only has
   a link to the *other* entity) is flagged distinctly and requires the
   `cross_entity_link` permission + a consent record before merging
   identities, per §3.1.
5. A `visits` row is created, linked to the UHID and (if one exists) the
   `appointments` row, with a fresh `visit_number`.

### 6.3 Appointment lifecycle & conflict detection

Booking always re-validates against the live exclusion constraint (not
just a pre-check in the UI) — the UI calls a "check availability"
endpoint for responsiveness, but the authoritative rejection happens at
insert time, and the API surfaces that DB rejection as a normal
409-style "slot no longer available" response so a double-click or race
between two receptionists can't double-book.

### 6.4 Clinical → estimate → invoice → receipt

```
treatment_plan_items  --(select items)-->  estimate_items
estimate (accepted)   --(convert, partial ok)-->  invoice_items
invoice (issued)       --(payment + allocation)-->  payment_allocations
```

Partial conversion: converting an estimate to an invoice lets billing
pick a subset of lines and, for a line, a quantity up to
`quantity - invoiced_quantity`. The conversion endpoint is one
transaction: create invoice + invoice_items, increment
`estimate_items.invoiced_quantity/invoiced_amount`, and if every line is
fully invoiced, flip the estimate to `status = 'converted'`.

### 6.5 OT workflow

OT booking requires a completed pre-op checklist and a `consent_records`
row (consent_type = `treatment`, scoped to the procedure) before the
booking can move from `scheduled` to `in_progress` — enforced by a
status-transition guard, the same pattern as appointment statuses.

### 6.6 Reporting

Every report query is built from the same entity-scoping middleware as
normal reads (§3.2) — a report is not a privileged backdoor around
entity isolation; "combined/cross-entity" reports require
`report.cross_entity` and explicitly union per-entity results rather
than running an unscoped query.

---

## 7. API Shape (Stage 1 slice)

```
POST   /auth/login                     session cookie + MFA challenge if required
POST   /auth/mfa/verify
POST   /auth/logout
POST   /auth/password/forgot
POST   /auth/password/reset

GET    /entities                       (entities the caller has access to)
GET    /entities/:id/settings
PATCH  /entities/:id/settings           [entity admin]

GET    /roles
POST   /roles                          clone/create custom role          [super admin]
PATCH  /roles/:id/permissions

GET    /users
POST   /users                                                              [super admin]
POST   /users/:id/entity-access                                            [super admin/entity admin]

GET    /doctors?entityId=
POST   /doctors
GET    /doctors/:id/availability
PUT    /doctors/:id/availability

GET    /staff
POST   /staff
```

All list endpoints are entity-scoped via the authenticated session by
default (`?entityId=` selects among the caller's accessible entities; it
is validated against `user_entity_access`, never trusted blindly).

---

## 8. Screen Navigation Structure

### 8.1 Desktop (primary workstation — reception, billing, admin)

```
App shell
├── Entity switcher (top bar) — only entities in user_entity_access
├── Collapsible sidebar
│   ├── Dashboard
│   ├── Patients (search, register, check-in)
│   ├── Appointments (Day/Week/Month/Doctor/Chair/OT views)
│   ├── Clinical (doctor-only: odontogram, plans, notes)
│   ├── Estimates
│   ├── Invoices
│   ├── Receipts / Payments
│   ├── OT Schedule
│   ├── Inventory/Documents (Stage 6)
│   ├── Reports
│   └── Admin ▸ Entities, Users & Roles, Staff & Doctors, Resources, Audit Log
└── Global quick-search (UHID / name / phone) — keyboard shortcut
```

### 8.2 Tablet (chairside)

```
Patient context bar (persistent) → Odontogram → Clinical Notes →
Treatment Progress → Signature capture (consent/estimate acceptance)
```

### 8.3 Mobile (doctor on the go / quick reception)

```
Today's appointments (doctor-scoped) → Patient quick search →
Visit summary (read) → Treatment notes (add) → Billing (view-only,
or limited actions per permission)
```

Navigation items are filtered by the signed-in user's permissions at
render time **and** every route's data is re-checked server-side — the
sidebar never shows an item whose underlying API would 403, but the API
403s regardless of what the sidebar shows.

---

## 9. Delivery Stages (recap)

1. DB architecture, entity management, auth, roles, staff — **this repo
   starts here.**
2. Patient registration, temp IDs, UHIDs, search.
3. Scheduling, chair/OT booking, check-in.
4. Patient dashboard, visits, odontogram, treatment plans, clinical notes.
5. Estimates, invoicing, receipts, payment allocation, advances, refunds.
6. Documents, consent, reporting, auditing polish, responsive QA, deployment.

Each stage adds Prisma migrations additively (no table is modeled twice);
this document's §5 is the full target schema and each stage's migration
only introduces the tables it needs.
