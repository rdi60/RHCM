import { execSync } from "node:child_process";
import * as path from "node:path";
import * as dotenv from "dotenv";

/** Runs once before the whole e2e suite: reset the test DB schema, then seed synthetic fixtures. */
export default async function globalSetup() {
  const envFile = path.resolve(__dirname, "../.env.test");
  const { parsed } = dotenv.config({ path: envFile });
  const databasePackageDir = path.resolve(__dirname, "../../../packages/database");

  const env = { ...process.env, ...parsed };

  execSync("npx prisma migrate deploy", { cwd: databasePackageDir, env, stdio: "inherit" });
  execSync("npx prisma db execute --stdin", {
    cwd: databasePackageDir,
    env,
    // NOTE: `input` only reaches the child when stdin is piped, not inherited —
    // stdio defaults to 'pipe' here, so leave it unset (don't pass stdio: "inherit").
    input: `
      TRUNCATE TABLE
        audit_logs, user_entity_access, role_permissions, doctor_entity_assignments,
        staff_entity_assignments, doctor_availability, doctor_leave, clinic_resources,
        entity_settings, doctors, staff, roles, permissions, users, entities,
        consent_records, patient_entity_links, temporary_registrations, patients,
        uhid_counter
      RESTART IDENTITY CASCADE;
    `,
  });
  execSync("npx ts-node --transpile-only prisma/seed.ts", { cwd: databasePackageDir, env, stdio: "inherit" });
}
