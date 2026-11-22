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
notes with an addendum chain for corrections, and prescriptions. Later
stages (billing, documents/reporting) build on this foundation — see
`docs/ARCHITECTURE.md` Section 9 for the full plan.

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

### First production Super Administrator

Never seed synthetic data in production. Instead:

```bash
BOOTSTRAP_ADMIN_EMAIL="admin@yourclinic.example" pnpm db:bootstrap:admin
```

This prompts for a password interactively (never stored in the repo or any
script) and grants that account Super Administrator access to every
existing entity. See `docs/ARCHITECTURE.md` Section 4.3.

## Tests

```bash
# Unit tests (e.g. the PermissionsGuard's fail-closed behavior)
pnpm --filter @rhcm/api test

# End-to-end (spins up a dedicated rhcm_test Postgres database; see
# apps/api/.env.test and apps/api/test/global-setup.ts)
pnpm --filter @rhcm/api test:e2e
```

The e2e suite (`apps/api/test/auth-rbac.e2e-spec.ts`) exercises, against a
real database and a real NestJS instance:

- login success/failure, account lockout after repeated failures, generic
  (non-enumerating) error messages
- the MFA challenge (password-correct-but-pending state, wrong code,
  correct code)
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

## Project layout

See `docs/ARCHITECTURE.md` for the full design: multi-entity data model,
RBAC model, business workflows, and screen navigation structure.
