# RHCM — Dental Clinic & Charity Trust Management System

A multi-entity, production-oriented clinic management system for a Main
Dental Clinic (10 chairs, 2 OTs) and a legally separate Charity Trust (3
chairs), built as described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Stage 1** covers: database architecture, entity management, session-based
authentication with mandatory MFA for privileged roles, role-based +
entity-scoped access control, and doctor/staff management.

**Stage 2** (this state of the repo) adds: temporary registration (name,
phone, DOB/age, gender, visit reason, preferred doctor — incomplete data
allowed), transactional/never-reused UHID generation, patient search
(UHID / temp ID / name / phone, with duplicate-match surfacing), and
check-in — matching an existing patient or minting a new UHID, with
cross-entity identity linking gated behind the `patient.cross_entity_link`
permission and a recorded consent. Later stages (scheduling, clinical
records, billing, documents/reporting) build on this foundation — see
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

## Project layout

See `docs/ARCHITECTURE.md` for the full design: multi-entity data model,
RBAC model, business workflows, and screen navigation structure.
