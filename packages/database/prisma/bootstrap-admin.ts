/**
 * Production-safe creation of the first Super Administrator. Unlike
 * seed.ts (synthetic dev/test data, fixed known passwords), this prompts
 * for the password interactively — it is never stored anywhere in the
 * repo, migrations, or seed data. Run once per environment:
 *
 *   pnpm db:bootstrap:admin
 *
 * Safe to re-run: if the email already has a user row, it is left alone
 * (use normal user management to reset a password instead).
 */
import * as argon2 from "argon2";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { SYSTEM_ROLES } from "@rhcm/shared";
import { PrismaClient } from "../generated/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim();
  if (!email) {
    throw new Error("Set BOOTSTRAP_ADMIN_EMAIL before running this script.");
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`A user with email ${email} already exists (id ${existing.id}). Nothing to do.`);
    return;
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const password = await rl.question(
    `Set the initial password for Super Administrator <${email}>\n(min 12 chars; input is not hidden in all terminals — ensure privacy): `,
  );
  rl.close();

  if (password.length < 12) {
    throw new Error("Password must be at least 12 characters.");
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

  const entities = await prisma.entity.findMany();
  if (entities.length === 0) {
    throw new Error("No entities exist yet. Create entities before bootstrapping an admin.");
  }

  const superAdminRole = await prisma.role.findFirst({
    where: { name: SYSTEM_ROLES.SUPER_ADMIN, entityId: null, isSystem: true },
  });
  if (!superAdminRole) {
    throw new Error("Super Administrator system role not found. Run the permission/role seed first.");
  }

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      mfaEnabled: false, // must complete MFA enrollment on first login before any privileged action
      entityAccess: {
        create: entities.map((entity) => ({ entityId: entity.id, roleId: superAdminRole.id })),
      },
    },
  });

  console.log(`Created Super Administrator ${user.email} (${user.id}) with access to all ${entities.length} entities.`);
  console.log("MFA is not yet enabled for this account — complete MFA setup on first login before it can be used for privileged actions.");
}

main()
  .catch((e) => {
    console.error(e.message ?? e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
