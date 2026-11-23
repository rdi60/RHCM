# RHCM — Dental Clinic & Charity Trust Management System

A multi-entity, production-oriented clinic management system for a Main
Dental Clinic (10 chairs, 2 OTs) and a legally separate Charity Trust (3
chairs), built as described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Stage 1** covers: database architecture, entity management, session-based
authentication with mandatory MFA for privileged roles, role-based +
entity-scoped access control, and doctor/staff management.

**Stage 2** adds: temporary registration (name, phone, DOB/age, gender,
visit reason, preferred doctor — incomplete data allowed),
transactional/never-reused UHID generation, patient search (UHID / temp
ID / name / phone, with duplicate-match surfacing), and check-in —
matching an existing patient or minting a new UHID, with cross-entity
identity linking gated behind the `patient.cross_entity_link` permission
and a recorded consent.

**Stage 3** adds: doctor scheduling and chair/OT booking on one unified
`appointments` model, with double-booking prevented at the **database
level** by partial GIST exclusion constraints (a doctor or a chair/OT can
never have two overlapping live appointments — see `Appointment`'s doc
comment in `packages/database/prisma/schema.prisma` for the
authorized-emergency-override design and its deliberate limits); Day
(chair/OT resource grid), Week, Month, and Doctor-wise calendar views;
availability computed from a doctor's recurring hours minus leave minus
existing bookings; a status-transition workflow (Booked → Confirmed →
Arrived → Checked In → Waiting → In Treatment → Completed, with
Cancelled/No-Show/Rescheduled reachable earlier); and check-in now creates
a `Visit` (with its own per-entity visit number), confirming a scheduled
appointment when one exists or logging a walk-in when none does.

**Stage 4** (this state of the repo) adds the clinical module: a Patient
Dashboard (tabs for Overview/Visits/Appointments/Treatment Plans) and a
per-visit Clinical Encounter screen (`/visits/:id`) covering an
interactive FDI odontogram (append-only history — a correction is a new
row, never an overwrite, so "what did we think last time" is always
reconstructable), tooth-wise diagnoses, multi-session treatment planning
(`TreatmentPlan` → `TreatmentPlanItem` → `TreatmentSession`, the session
being the spec's "Treatment ID", tracking who planned, who it's assigned
to, and who actually performed it — auto-resolved from the acting
doctor's own account, not just whoever's logged in), append-only clinical
notes with an addendum chain for corrections, and prescriptions.

**Stage 5** (this state of the repo) adds billing — a new **Billing** tab
on the Patient Dashboard covering: tax profiles and per-entity treatment
pricing overrides; estimates (`DRAFT → SENT → ACCEPTED/REJECTED/EXPIRED`,
with a revise-into-a-new-version flow that supersedes the original) with
a print view; converting an accepted estimate's lines into an invoice —
fully or partially, any number of times, with **DB CHECK constraints**
(`estimate_items_invoiced_qty_check`/`_invoiced_amount_check`) making it
impossible to invoice the same line twice even under concurrent requests;
direct ad hoc invoicing; posted invoices are immutable — correcting one
voids it and atomically issues a linked replacement; payments with
idempotent recording (a retried submit returns the original payment, never
a duplicate) and one receipt minted per payment; payment allocation —
splitting a payment across invoices, or one invoice across payments, with
**hand-written Postgres trigger functions** (not just application code)
enforcing that allocations can never exceed an invoice's balance, a
payment's own amount, or cross an entity boundary, and automatically
keeping `invoice.paidAmount`/`status` (`ISSUED → PARTIALLY_PAID → PAID`)
in sync as allocations are made or reversed; credit notes; and a refund
workflow (`REQUESTED → APPROVED → COMPLETED`/`REJECTED`) requiring
`refund.approve` to move past REQUESTED, with the same trigger-enforced
cap against the original payment's amount. See `packages/database/prisma/
schema.prisma`'s `Invoice`/`PaymentAllocation` doc comments and the
`20261122170000_stage5_billing` migration's hand-written SQL for the full
enforcement design.

**Stage 6** (this state of the repo) adds documents, consent, reporting,
audit polish, responsive QA, and deployment. A new **Documents** tab on
the Patient Dashboard covers private file storage — upload goes through a
short-lived presigned URL straight to S3-compatible object storage (MinIO
locally; see `StorageService`), never a public bucket URL, with a
confirm step where a real deployment's async virus-scan result would
flip `scanStatus` (`PENDING → CLEAN`/`INFECTED`/`ERROR`) before a
download link is ever issued, and soft-delete that keeps the row (and
the object, per retention policy) rather than hard-deleting. The same
tab's **Consent Records** section exposes the existing append-only
`ConsentRecord` model for any consent type (treatment, photo/video, data
sharing, marketing — not just the cross-entity-link consent Stage 2
already used it for), versioned the same way clinical notes are. A new
**Reports** page covers collections (by day/mode), outstanding balances,
doctor production, and patient footfall, each entity-scoped by default
with an explicit combined/cross-entity variant (gated by
`report.cross_entity`) that unions per-entity results rather than ever
running an unscoped query, per `docs/ARCHITECTURE.md` Section 6.6. The
Audit Log page gained filters (action/resource type/actor/date range)
and an expandable before/after diff. A responsive-QA pass (Playwright at
desktop/tablet/mobile widths) found and fixed a real bug — the Patient
Dashboard's tab bar forced horizontal scroll on the whole page on narrow
viewports once it grew to 6 tabs; it now scrolls independently of the
page. Finally, this stage adds production Dockerfiles for both apps,
`docker-compose.prod.yml`, a CI workflow, and the Deployment section
below.

**Stage 7** (this state of the repo) adds interactive API documentation and
a security hardening pass. The API now serves a Swagger/OpenAPI UI — see
[API Documentation](#api-documentation) below — generated from the
existing `class-validator`-decorated DTOs via the `@nestjs/swagger` compiler
plugin, with no manual `@ApiProperty()` annotation needed. The hardening
pass covers session fixation (the session ID is regenerated on every
privilege change — password-verified login and MFA verification), TOTP
replay protection (a captured, already-used MFA code is rejected even
though it's otherwise valid), a JSON-only body parser, `trust proxy` for
correct client-IP/HTTPS detection behind a reverse proxy, a throttle on
the password-reset endpoint, and a dependency vulnerability sweep. See
[SECURITY.md](SECURITY.md) for the full write-up.

See `docs/ARCHITECTURE.md` Section 9 for the original 6-stage plan (Stage 7
was scoped afterward: API docs + security hardening, per the project's own
follow-up planning — OT management is not part of the original plan and
remains out of scope).

## Stack

- **apps/web** — Next.js 15 (App Router) + TypeScript + Tailwind, responsive PWA shell
- **apps/api** — NestJS + TypeScript, session-based REST API
- **packages/database** — Prisma schema, migrations, seed/bootstrap scripts
- **packages/shared** — permission/role constants shared between API, seed data, and the web app

## Prerequisites

- Node.js 22+, pnpm 10+
- PostgreSQL 16 and Redis (session store) — `docker-compose.yml` provides these plus MinIO (S3-compatible object storage, for Stage 6) for local dev

## Setup

```bash
pnpm install

# Infra (Postgres + Redis + MinIO)
docker compose up -d

# Environment
cp .env.example .env
# edit .env: at minimum, generate your own MFA_ENCRYPTION_KEY and SESSION_SECRET
#   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
cp .env packages/database/.env
cp .env apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local

# Build the shared/database packages first (apps consume their compiled dist/)
pnpm --filter @rhcm/shared build
pnpm --filter @rhcm/database generate
pnpm db:migrate     # applies all migrations
pnpm db:seed        # synthetic dev/test users, patients, etc. — see below
```

> `prisma migrate dev` refuses to run in a non-interactive terminal (CI, some
> sandboxes) whenever it has a warning to show (e.g. a new unique
> constraint). If you hit `"non-interactive, which is not supported"` there,
> generate the migration's SQL from the schema diff and apply it directly
> instead of trying to force interactivity:
> ```bash
> cd packages/database
> mkdir -p prisma/migrations/$(date +%Y%m%d%H%M%S)_your_migration_name
> npx prisma migrate diff --from-schema-datasource prisma/schema.prisma \
>   --to-schema-datamodel prisma/schema.prisma --script \
>   > prisma/migrations/<the_folder_above>/migration.sql
> npx prisma migrate deploy
> ```

### Running

```bash
pnpm dev:api   # NestJS on :4000
pnpm dev:web   # Next.js on :3000
```

Open http://localhost:3000 — you'll land on `/login`.

### Synthetic seed accounts

`pnpm db:seed` is **dev/test only** (it refuses to run when
`NODE_ENV=production`) and creates one account per system role, all sharing
the same password, printed at the end of the seed run (default
`DevPass!2026`, overridable via `SEED_USER_PASSWORD`):

| Email | Role | Entity | MFA |
|---|---|---|---|
| superadmin@rhcm.test | Super Administrator | Clinic + Trust | Yes |
| clinicadmin@rhcm.test | Clinic Administrator | Clinic | Yes |
| trustadmin@rhcm.test | Trust Administrator | Trust | Yes |
| receptionist@rhcm.test | Receptionist | Clinic | No |
| doctor@rhcm.test | Doctor / Consultant | Clinic + Trust | No |
| nurse@rhcm.test | Nurse / Dental Assistant | Clinic | No |
| otstaff@rhcm.test | OT Staff | Clinic | No |
| billing@rhcm.test | Billing Executive | Clinic | No |
| accountant@rhcm.test | Accountant | Clinic + Trust | Yes |
| management@rhcm.test | Management / Reporting User | Clinic + Trust | Yes |

MFA-enabled accounts share one known dev TOTP secret (`JBSWY3DPEHPK3PXP`,
also printed by the seed) so you can generate a code without an
authenticator app:

```bash
node -e "console.log(require('otplib').authenticator.generate('JBSWY3DPEHPK3PXP'))"
```

### Synthetic seed patients

The seed also creates a few patients (at the Clinic unless noted) to
demonstrate Stage 2 behavior out of the box:

| UHID | Name | Notes |
|---|---|---|
| RD-000001 | Ravi Kumar | Has a `CHECKED_IN` temp registration (`TMP-000001`) |
| RD-000002 / RD-000003 | Priya Sharma (×2) | Deliberate same-name duplicates, for exercising duplicate-match search |
| RD-000004 | Arun Das | Linked to **both** Clinic and Trust, with the `CROSS_ENTITY_IDENTITY_LINKING` consent record the link required |

Plus one `OPEN` (not yet checked in) temp registration, `TMP-000002`
("Walk-in Enquiry"), with only a name and phone — demonstrating that
registration is allowed to be incomplete.

### Synthetic seed appointments & visits

Three future `BOOKED`/`CONFIRMED` appointments, so the calendar views
aren't empty on first login: Priya Sharma in a Clinic chair, Arun Das in
the Clinic's OT 1 (both 2026-12-10 IST), and Ravi Kumar in a Trust chair
(2026-12-11 IST) — all with `doctor@rhcm.test`. Plus one `WAITING` visit for
Priya Sharma's second record, already checked in at the Clinic, so
**Waiting List** shows something immediately rather than needing a check-in
first.

### Synthetic seed clinical data

A 12-procedure treatment catalog (consultation through implants), and a
`COMPLETED` visit for Ravi Kumar at the Clinic with: a dental chart entry
(tooth 46, Caries), a diagnosis (irreversible pulpitis), an active
treatment plan with two items — a root canal (completed, with its session
marked performed by `doctor@rhcm.test`) and a crown (still planned) — a
clinical note with one addendum, and a two-drug prescription. Open
`/patients/<Ravi's id>` → **Visits** tab, or just search "Ravi" from
Patients, to see it end to end.

### Synthetic seed billing data

For Ravi Kumar (Clinic): a `GST 18%` tax profile; an `ACCEPTED` estimate
for a crown (₹6000 + 18% GST = ₹7080) left un-invoiced, so you can walk
through **Convert to invoice** yourself; and a fully-paid invoice for his
completed root canal (₹5000 + 18% GST = ₹5900, `PAID`) with a ₹100
goodwill credit note and a matching ₹100 `COMPLETED` refund against that
payment. For Priya Sharma (second record, Clinic): an `ISSUED` invoice
(₹800, no tax) half-paid by a ₹400 UPI payment, left `PARTIALLY_PAID` so
that status isn't easy to forget to demo. Open `/patients/<Ravi's id>` →
**Billing** tab to see it end to end.

### Synthetic seed documents & consent

Ravi Kumar also has one `CLEAN` X-ray document (`tooth46-iopa.png`,
category `xray` — note this is seed metadata only, with no real bytes
behind its storage key, so its Download link in the UI won't resolve to
an actual file) and a `TREATMENT` consent record (v1, granted). Open
`/patients/<Ravi's id>` → **Documents** tab to see both.

### First production Super Administrator

Never seed synthetic data in production. Instead:

```bash
BOOTSTRAP_ADMIN_EMAIL="admin@yourclinic.example" pnpm db:bootstrap:admin
```

This prompts for a password interactively (never stored in the repo or any
script) and grants that account Super Administrator access to every
existing entity. See `docs/ARCHITECTURE.md` Section 4.3.

## API Documentation

With `pnpm dev:api` running, open http://localhost:4000/api/docs for an
interactive Swagger UI covering every route (97 paths across 23 tagged
groups as of Stage 7), including request/response schemas derived
directly from each endpoint's DTO. It's on by default outside
production; in production it's off unless `ENABLE_API_DOCS=true` is set
(see `apps/api/src/main.ts`). The UI can't log in for you — authenticate
first in the same cookie-aware browser tab (`POST /auth/login`, then
`POST /auth/mfa/verify` if MFA is enabled) and "Try it out" will use that
session. The raw machine-readable spec is at `/api/docs-json`.

## Security

See [SECURITY.md](SECURITY.md) for the full hardening write-up (session
fixation, TOTP replay protection, CORS/CSRF posture, body-parsing,
dependency audit) and its accepted-risk/known-limitation notes.

## Tests

```bash
# Unit tests (e.g. the PermissionsGuard's fail-closed behavior)
pnpm --filter @rhcm/api test

# End-to-end (spins up a dedicated rhcm_test Postgres database; see
# apps/api/.env.test and apps/api/test/global-setup.ts). Runs with
# --runInBand: several spec files log in as the same shared seeded
# accounts (e.g. superadmin@rhcm.test), and a couple of auth-rbac's own
# tests mutate shared fixtures (account lockout, password reset) before
# restoring them — serial execution keeps that deterministic instead of
# racing against other files' beforeAll logins.
pnpm --filter @rhcm/api test:e2e
```

The e2e suite (`apps/api/test/auth-rbac.e2e-spec.ts`) exercises, against a
real database and a real NestJS instance:

- login success/failure, account lockout after repeated failures, generic
  (non-enumerating) error messages
- the MFA challenge (password-correct-but-pending state, wrong code,
  correct code, and — Stage 7 — that a second use of the same correct
  code is rejected as a replay)
- permission-guard denial (missing permission) and entity-isolation
  denial (right permission, wrong entity)
- MFA-mandatory-role enforcement when granting access
- custom role creation/permission editing, and that system role templates
  can't be edited
- the password reset cycle end-to-end
- doctor creation and availability replacement

`apps/api/test/patients.e2e-spec.ts` (Stage 2) additionally covers:

- incomplete temporary registration (name only)
- per-entity temp-ID numbering that doesn't collide across entities
- UHID uniqueness under **concurrent** check-ins (8 parallel requests)
- duplicate-name search surfacing both matches
- that the default search never returns another entity's patients
- cross-entity search denied without `patient.cross_entity_link`, and that
  it correctly lists which entities a candidate is already linked to
- cross-entity check-in rejected without consent, accepted (same UHID
  preserved) with consent recorded
- entity-scoped check-in rejection (wrong entity) and patient-detail 404
  when there's no link to the requested entity

`apps/api/test/appointments.e2e-spec.ts` (Stage 3) additionally covers:

- booking, and that an overlapping booking for the same doctor OR the same
  chair/OT is rejected (409) even when the other half of the pair differs
- that booking never collides under **5 concurrent** requests for the same
  doctor/slot — exactly one succeeds
- the authorized emergency override: denied without
  `appointment.override_conflict`; with it, a doctor conflict is bypassed
  but the **same chair is still rejected** — the override never applies
  to resources
- invalid status jumps rejected (e.g. Booked → Completed directly) and the
  normal Booked → Arrived → Checked In path allowed
- availability marks an already-booked slot unavailable
- entity-scoped appointment lookup (404 from the wrong entity)
- check-in creates a Visit from a scheduled appointment (doctor/chair/reason
  copied across), appears on the waiting list, and the full
  Waiting → In Treatment → Completed walk also completes its appointment

`apps/api/test/clinical.e2e-spec.ts` (Stage 4) additionally covers:

- the treatment catalog is readable globally (not entity-scoped)
- the dental chart is append-only: recording two entries for the same
  tooth keeps both, most-recent-first — never an overwrite
- recording a chart entry denied without `clinical.diagnose`
- the full plan → item → session lifecycle: creating a session moves its
  item from `PLANNED` to `IN_PROGRESS`; marking it `COMPLETED` moves the
  item to `COMPLETED` too, and auto-resolves `performedByDoctorId` from
  the acting doctor's own account
- planning denied without `clinical.plan_treatment` (nurse); performing a
  session denied without `clinical.perform_treatment` (receptionist)
- a clinical note addendum chains to the original without mutating it
- a doctor can issue a prescription; a receptionist cannot
- entity-scoped 404s on a visit's diagnoses/notes/prescriptions from the
  wrong entity

`apps/api/test/billing.e2e-spec.ts` (Stage 5) additionally covers:

- estimate totals computed exactly (gross/discount/tax/net, tax applied
  after discount), the `DRAFT → SENT → ACCEPTED/REJECTED` workflow with
  invalid jumps rejected, and revising an estimate supersedes the original
  and bumps its version
- partial estimate→invoice conversion tracks `invoicedQuantity`; a second
  conversion of the same line beyond what's left is rejected; converting
  the remainder flips the estimate to `CONVERTED`; and under **5
  concurrent** conversion requests for the same line, exactly one succeeds
  — the `estimate_items` CHECK constraints are the real backstop, not just
  the service-layer pre-check
- a posted invoice can't be voided while it has an active payment
  allocation; correcting one voids the original and links a fresh
  replacement via `correctedByInvoiceId`
- payment recording is idempotent (same `idempotencyKey` ⇒ same payment,
  never a duplicate) and mints exactly one receipt
- payment allocation never exceeds an invoice's balance or a payment's
  remaining amount; never crosses entities (a Trust payment can't be
  allocated to a Clinic invoice); keeps `invoice.paidAmount`/`status` in
  sync as allocations are made and reversed; and under **5 concurrent**
  allocation requests for the same invoice/payment, exactly one succeeds
- credit notes issue/void; refunds walk `REQUESTED → APPROVED →
  COMPLETED`/`REJECTED` with the approval gate enforced, and never refund
  more than the original payment's amount even across multiple approved
  refunds racing to complete
- RBAC denials for every billing action (`estimate.create`,
  `invoice.create`/`invoice.void`, `payment.receive`/`payment.allocate`,
  `refund.approve`) and entity-scoped 404s on estimates/invoices/receipts

`apps/api/test/documents.e2e-spec.ts` (Stage 6) additionally covers:

- the full upload lifecycle: requesting an upload URL, confirming it
  (`PENDING → CLEAN`), listing it, and that a download URL is refused
  until it's confirmed CLEAN
- soft-delete removes a document from its patient's list and 404s a
  direct fetch, without needing `document.delete` to see the list itself
- the server-side upload size cap rejects an oversized file before a
  storage URL is ever minted
- RBAC denials for `document.upload`/`document.delete`, and an
  entity-scoped 404 on a document fetched from the wrong entity
- consent capture is append-only and versioned: a second capture of the
  same type for the same patient creates v2 rather than overwriting v1,
  and denies without `patient.consent_manage`

`apps/api/test/reports.e2e-spec.ts` (Stage 6) additionally covers:

- a freshly recorded payment shows up in that day's collections
  breakdown by exact amount and mode
- entity isolation: a payment recorded in one entity never appears in
  another entity's collections report
- outstanding balances lists a freshly created unpaid invoice with its
  exact balance; doctor production attributes an invoiced line to the
  correct (freshly created, so isolated from any other data) doctor
- the cross-entity report variant is denied without
  `report.cross_entity`, and for a caller who has it, unions results
  across every entity they can access
- audit log filtering by action substring, resource type, and date range
  all narrow correctly, and the endpoint itself is denied without
  `audit_log.read`

(Stage 6 also fixed a pre-existing test-suite flakiness bug found while
adding its own spec files — `apps/api/test/auth-rbac.e2e-spec.ts`'s own
lockout and password-reset tests were permanently mutating two shared
seeded accounts other spec files log in as; those tests now restore the
account afterward, and `test:e2e` runs with `--runInBand` so spec files
never race each other's use of shared fixtures.)

## Deployment

Production Dockerfiles for both apps (`apps/api/Dockerfile`,
`apps/web/Dockerfile`) and a self-contained stack
(`docker-compose.prod.yml`: Postgres, Redis, MinIO, the API, and the web
app) are included. A real deployment would more likely swap
Postgres/Redis/MinIO for managed equivalents (RDS/Cloud SQL,
ElastiCache/Memorystore, S3) and keep only the `api`/`web` services from
that compose file behind your own reverse proxy/TLS termination (nginx,
Caddy, your cloud LB) — neither Dockerfile nor compose file does TLS
itself.

Both images are multi-stage, non-root, and built via `pnpm deploy` (API)
/ Next's `output: "standalone"` (web) so the shipped image carries only
production `node_modules` and build output — no source, tests, or `.env`
files. The build context for both is the **monorepo root** (not
`apps/api`/`apps/web`), since each needs to resolve its `@rhcm/shared`
(and, for the API, `@rhcm/database`) workspace dependencies:

```bash
docker build -f apps/api/Dockerfile -t rhcm-api .
docker build -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_BASE_URL=https://api.yourclinic.example \
  -t rhcm-web .
```

`NEXT_PUBLIC_API_BASE_URL` is baked into the web app's client bundle at
**build** time (not read at container start), so it must be the real
public API URL before you build, not patched in afterward via an
environment variable on the running container.

### Running the stack

```bash
cp .env.prod.example .env.prod
# fill in every value — POSTGRES_PASSWORD, SESSION_SECRET,
# MFA_ENCRYPTION_KEY, WEB_BASE_URL, NEXT_PUBLIC_API_BASE_URL,
# S3_ACCESS_KEY_ID/S3_SECRET_ACCESS_KEY — and never commit it.

docker compose -f docker-compose.prod.yml --env-file .env.prod build
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

Then, from a machine or CI runner with the repo checked out and
`DATABASE_URL` pointed at the production database (migrations don't run
from inside the slim runtime image — `prisma`, the CLI, is a
devDependency intentionally left out of it):

```bash
DATABASE_URL="postgresql://rhcm:<password>@<host>:5432/rhcm?schema=public" \
  pnpm --filter @rhcm/database migrate:deploy
```

Then create the first production Super Administrator (never run
`db:seed` against production — it refuses to run when
`NODE_ENV=production` anyway):

```bash
DATABASE_URL="..." BOOTSTRAP_ADMIN_EMAIL="admin@yourclinic.example" \
  pnpm --filter @rhcm/database bootstrap:admin
```

### Health & readiness

- `GET /entities` on the API (any `@Public()` route would do) is a
  reasonable liveness check once a session cookie isn't required — there
  is no dedicated `/health` endpoint yet.
- The `postgres`/`redis`/`minio` services in `docker-compose.prod.yml`
  carry Docker healthchecks already; `api`/`web` wait on those via
  `depends_on: condition: service_healthy`.

### Backups

- **Postgres** is the system of record for everything except file
  bytes — back it up like any production database (`pg_dump`/continuous
  WAL archiving/your managed provider's snapshots). Losing it loses
  patients, billing history, and the audit log.
- **Object storage** (MinIO/S3) holds the actual document bytes;
  `patient_documents.storage_key` is meaningless without them. Back up
  the bucket (MinIO supports `mc mirror`; S3 has versioning/replication)
  on the same cadence as the database, and test a restore occasionally —
  a restored database with no matching objects leaves every "Download"
  link broken.
- **Redis** holds only sessions — safe to lose (users are logged out) and
  does not need backing up.

## Project layout

See `docs/ARCHITECTURE.md` for the full design: multi-entity data model,
RBAC model, business workflows, and screen navigation structure.
