/**
 * DEV/TEST synthetic data only. Never run against a production database —
 * every password here is a known, published dev credential. Production's
 * first Super Administrator is created via `pnpm db:bootstrap:admin`
 * instead, which prompts for a password interactively.
 */
import * as argon2 from "argon2";
import {
  ENTITY_SEED,
  PERMISSION_CATALOG,
  SYSTEM_ROLES,
  SYSTEM_ROLE_PERMISSIONS,
  MFA_MANDATORY_ROLES,
  type SystemRoleName,
} from "@rhcm/shared";
import { SecretCipher } from "./secret-cipher";
import { PrismaClient, ResourceType } from "../generated/client";

const prisma = new PrismaClient();

const DEV_PASSWORD = process.env.SEED_USER_PASSWORD ?? "DevPass!2026";
// A fixed, clearly-fake base32 secret so seeded MFA-mandatory users can log
// in during local/e2e testing with a deterministic TOTP code.
const DEV_MFA_SECRET = "JBSWY3DPEHPK3PXP";

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run synthetic seed data against NODE_ENV=production.");
  }

  const passwordHash = await argon2.hash(DEV_PASSWORD, { type: argon2.argon2id });
  const mfaEncryptionKey = process.env.MFA_ENCRYPTION_KEY;
  if (!mfaEncryptionKey) throw new Error("Set MFA_ENCRYPTION_KEY before seeding (see .env.example).");
  const cipher = new SecretCipher(mfaEncryptionKey);
  const encryptedDevMfaSecret = cipher.encrypt(DEV_MFA_SECRET);

  // --- Entities -----------------------------------------------------------
  const entities: Record<string, Awaited<ReturnType<typeof prisma.entity.upsert>>> = {};
  for (const seed of Object.values(ENTITY_SEED)) {
    const entity = await prisma.entity.upsert({
      where: { code: seed.code },
      update: { legalName: seed.legalName, displayName: seed.displayName },
      create: {
        code: seed.code,
        legalName: seed.legalName,
        displayName: seed.displayName,
        settings: {
          create: {
            addressJson: { line1: "Synthetic address", city: "Chennai", state: "Tamil Nadu", country: "India" },
            contactJson: { phone: "+91-9999900000" },
          },
        },
      },
    });
    entities[seed.code] = entity;

    for (let i = 1; i <= seed.chairs; i++) {
      await prisma.clinicResource.upsert({
        where: { entityId_type_number: { entityId: entity.id, type: ResourceType.CHAIR, number: i } },
        update: {},
        create: { entityId: entity.id, type: ResourceType.CHAIR, number: i, label: `Chair ${i}` },
      });
    }
    for (let i = 1; i <= seed.ots; i++) {
      await prisma.clinicResource.upsert({
        where: { entityId_type_number: { entityId: entity.id, type: ResourceType.OT, number: i } },
        update: {},
        create: { entityId: entity.id, type: ResourceType.OT, number: i, label: `OT ${i}` },
      });
    }
  }
  console.log(`Seeded entities: ${Object.keys(entities).join(", ")}`);

  // --- Permissions ----------------------------------------------------------
  for (const perm of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: { category: perm.category, description: perm.description },
      create: perm,
    });
  }
  console.log(`Seeded ${PERMISSION_CATALOG.length} permissions.`);

  // --- System roles (global templates, entityId = null) --------------------
  // NOTE: entityId is nullable and Postgres unique indexes treat every NULL
  // as distinct, so the @@unique([entityId, name]) constraint can't be used
  // to upsert a null-entityId row (it would never match, and re-seeding
  // would create duplicates). Look these up by name + isSystem instead.
  const roleIds: Record<SystemRoleName, string> = {} as Record<SystemRoleName, string>;
  for (const roleName of Object.values(SYSTEM_ROLES)) {
    const existing = await prisma.role.findFirst({ where: { name: roleName, entityId: null, isSystem: true } });
    const role = existing ?? (await prisma.role.create({ data: { name: roleName, isSystem: true } }));
    roleIds[roleName] = role.id;

    const permissionCodes = SYSTEM_ROLE_PERMISSIONS[roleName];
    const permissions = await prisma.permission.findMany({ where: { code: { in: permissionCodes } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
  }
  console.log(`Seeded ${Object.keys(roleIds).length} system roles.`);

  // --- Users across all 10 roles --------------------------------------------
  async function upsertUser(email: string, opts: { mfa?: boolean } = {}) {
    const needsMfa = opts.mfa ?? false;
    return prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        passwordHash,
        mfaEnabled: needsMfa,
        mfaSecretEncrypted: needsMfa ? encryptedDevMfaSecret : null,
      },
    });
  }

  async function grantAccess(userId: string, entityCode: keyof typeof ENTITY_SEED, roleName: SystemRoleName) {
    await prisma.userEntityAccess.upsert({
      where: {
        userId_entityId_roleId: {
          userId,
          entityId: entities[entityCode].id,
          roleId: roleIds[roleName],
        },
      },
      update: {},
      create: { userId, entityId: entities[entityCode].id, roleId: roleIds[roleName] },
    });
  }

  const superAdmin = await upsertUser("superadmin@rhcm.test", { mfa: true });
  await grantAccess(superAdmin.id, "CLINIC", SYSTEM_ROLES.SUPER_ADMIN);
  await grantAccess(superAdmin.id, "TRUST", SYSTEM_ROLES.SUPER_ADMIN);

  const clinicAdmin = await upsertUser("clinicadmin@rhcm.test", { mfa: true });
  await grantAccess(clinicAdmin.id, "CLINIC", SYSTEM_ROLES.CLINIC_ADMIN);

  const trustAdmin = await upsertUser("trustadmin@rhcm.test", { mfa: true });
  await grantAccess(trustAdmin.id, "TRUST", SYSTEM_ROLES.TRUST_ADMIN);

  const receptionist = await upsertUser("receptionist@rhcm.test");
  await grantAccess(receptionist.id, "CLINIC", SYSTEM_ROLES.RECEPTIONIST);
  const receptionistStaff = await prisma.staff.upsert({
    where: { employeeCode: "EMP-0001" },
    update: {},
    create: { userId: receptionist.id, fullName: "Receptionist Demo", designation: "Front Desk", employeeCode: "EMP-0001" },
  });
  await prisma.staffEntityAssignment.upsert({
    where: { staffId_entityId: { staffId: receptionistStaff.id, entityId: entities.CLINIC.id } },
    update: {},
    create: { staffId: receptionistStaff.id, entityId: entities.CLINIC.id },
  });

  const doctorUser = await upsertUser("doctor@rhcm.test");
  await grantAccess(doctorUser.id, "CLINIC", SYSTEM_ROLES.DOCTOR);
  await grantAccess(doctorUser.id, "TRUST", SYSTEM_ROLES.DOCTOR);
  const doctor = await prisma.doctor.upsert({
    where: { registrationNumber: "DCI-10001" },
    update: {},
    create: {
      userId: doctorUser.id,
      fullName: "Dr. Demo Doctor",
      registrationNumber: "DCI-10001",
      qualificationsJson: ["BDS", "MDS (Conservative Dentistry)"],
      specialtiesJson: ["Root Canal Treatment", "Prosthodontics"],
      defaultConsultationFee: 500,
    },
  });
  await prisma.doctorAvailability.deleteMany({ where: { doctorId: doctor.id } });
  for (const entityCode of ["CLINIC", "TRUST"] as const) {
    await prisma.doctorEntityAssignment.upsert({
      where: { doctorId_entityId: { doctorId: doctor.id, entityId: entities[entityCode].id } },
      update: {},
      create: { doctorId: doctor.id, entityId: entities[entityCode].id },
    });
    await prisma.doctorAvailability.create({
      data: {
        doctorId: doctor.id,
        entityId: entities[entityCode].id,
        weekday: 1, // Monday
        startTime: "09:00",
        endTime: "17:00",
        breakStart: "13:00",
        breakEnd: "14:00",
        slotDurationMinutes: 15,
        effectiveFrom: new Date("2026-01-01"),
      },
    });
  }

  // A doctor enrolled with no login account, per spec ("a doctor doesn't
  // need a login account to be enrolled").
  await prisma.doctor.upsert({
    where: { registrationNumber: "DCI-10002" },
    update: {},
    create: {
      fullName: "Dr. No-Login Consultant",
      registrationNumber: "DCI-10002",
      qualificationsJson: ["BDS"],
      specialtiesJson: ["General Dentistry"],
      defaultConsultationFee: 300,
    },
  });

  const nurse = await upsertUser("nurse@rhcm.test");
  await grantAccess(nurse.id, "CLINIC", SYSTEM_ROLES.NURSE);

  const otStaff = await upsertUser("otstaff@rhcm.test");
  await grantAccess(otStaff.id, "CLINIC", SYSTEM_ROLES.OT_STAFF);

  const billingExec = await upsertUser("billing@rhcm.test");
  await grantAccess(billingExec.id, "CLINIC", SYSTEM_ROLES.BILLING_EXECUTIVE);

  const accountant = await upsertUser("accountant@rhcm.test", { mfa: true });
  await grantAccess(accountant.id, "TRUST", SYSTEM_ROLES.ACCOUNTANT);
  await grantAccess(accountant.id, "CLINIC", SYSTEM_ROLES.ACCOUNTANT);

  const management = await upsertUser("management@rhcm.test");
  await grantAccess(management.id, "CLINIC", SYSTEM_ROLES.MANAGEMENT);
  await grantAccess(management.id, "TRUST", SYSTEM_ROLES.MANAGEMENT);

  console.log("Seeded synthetic users for all 10 roles.");
  console.log(`Dev login password for every seeded user: ${DEV_PASSWORD}`);
  console.log(`Dev TOTP secret for MFA-enabled seeded users: ${DEV_MFA_SECRET}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
