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
import { nextTempRegistrationId, nextUhid, nextVisitNumber, nextEstimateNumber, nextInvoiceNumber, nextReceiptNumber } from "../src/sequences";
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

  await prisma.uhidCounter.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, prefix: "RD", nextSeq: 1 },
  });

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

  // --- Patients, temp registrations, consent (Stage 2) ---------------------
  async function findOrCreatePatient(opts: {
    phone: string;
    fullName: string;
    gender?: "MALE" | "FEMALE" | "OTHER" | "UNSPECIFIED";
    dob?: Date;
    allergiesJson?: unknown;
    medicalAlertsJson?: unknown;
  }) {
    const existing = await prisma.patient.findFirst({ where: { phone: opts.phone } });
    if (existing) return existing;
    return prisma.$transaction(async (tx) => {
      const uhid = await nextUhid(tx);
      return tx.patient.create({
        data: {
          uhid,
          fullName: opts.fullName,
          phone: opts.phone,
          gender: opts.gender ?? "UNSPECIFIED",
          dob: opts.dob,
          allergiesJson: opts.allergiesJson,
          medicalAlertsJson: opts.medicalAlertsJson,
        },
      });
    });
  }

  async function linkPatientToEntity(patientId: string, entityId: string) {
    await prisma.patientEntityLink.upsert({
      where: { patientId_entityId: { patientId, entityId } },
      update: {},
      create: { patientId, entityId },
    });
  }

  const ravi = await findOrCreatePatient({
    phone: "+91-9000000001",
    fullName: "Ravi Kumar",
    gender: "MALE",
    dob: new Date("1990-04-12"),
  });
  await linkPatientToEntity(ravi.id, entities.CLINIC.id);

  // Deliberate near-duplicate pair for exercising duplicate-match search:
  // same name, different phone/patient.
  const priya1 = await findOrCreatePatient({ phone: "+91-9000000002", fullName: "Priya Sharma", gender: "FEMALE" });
  await linkPatientToEntity(priya1.id, entities.CLINIC.id);
  const priya2 = await findOrCreatePatient({ phone: "+91-9000000003", fullName: "Priya Sharma", gender: "FEMALE" });
  await linkPatientToEntity(priya2.id, entities.CLINIC.id);

  // A patient already linked to the Trust, available for a cross-entity
  // check-in match demo at the Clinic.
  const arun = await findOrCreatePatient({
    phone: "+91-9000000004",
    fullName: "Arun Das",
    gender: "MALE",
    allergiesJson: ["Penicillin"],
    medicalAlertsJson: ["Hypertension"],
  });
  await linkPatientToEntity(arun.id, entities.TRUST.id);

  // Demonstrates the authorized cross-entity identity link: Arun is also
  // seen at the Clinic, with the consent record the match requires.
  await linkPatientToEntity(arun.id, entities.CLINIC.id);
  const existingConsent = await prisma.consentRecord.findFirst({
    where: { patientId: arun.id, entityId: entities.CLINIC.id, consentType: "CROSS_ENTITY_IDENTITY_LINKING" },
  });
  if (!existingConsent) {
    await prisma.consentRecord.create({
      data: {
        patientId: arun.id,
        entityId: entities.CLINIC.id,
        consentType: "CROSS_ENTITY_IDENTITY_LINKING",
        granted: true,
        capturedById: superAdmin.id,
      },
    });
  }

  // Completed (checked-in) temp registration at the Clinic.
  let checkedInReg = await prisma.temporaryRegistration.findFirst({
    where: { entityId: entities.CLINIC.id, matchedPatientId: ravi.id, status: "CHECKED_IN" },
  });
  if (!checkedInReg) {
    const checkedInTempId = await nextTempRegistrationId(prisma, entities.CLINIC.id);
    checkedInReg = await prisma.temporaryRegistration.create({
      data: {
        tempId: checkedInTempId,
        entityId: entities.CLINIC.id,
        fullName: ravi.fullName,
        phone: ravi.phone,
        visitReason: "Tooth pain, lower right molar",
        preferredDoctorId: doctor.id,
        status: "CHECKED_IN",
        matchedPatientId: ravi.id,
        createdById: receptionist.id,
      },
    });
  }

  // Open, deliberately incomplete temp registration — only a name and
  // phone were captured, matching "allow incomplete registration".
  let openReg = await prisma.temporaryRegistration.findFirst({
    where: { entityId: entities.CLINIC.id, phone: "+91-9000000099", status: "OPEN" },
  });
  if (!openReg) {
    const openTempId = await nextTempRegistrationId(prisma, entities.CLINIC.id);
    openReg = await prisma.temporaryRegistration.create({
      data: {
        tempId: openTempId,
        entityId: entities.CLINIC.id,
        fullName: "Walk-in Enquiry",
        phone: "+91-9000000099",
        status: "OPEN",
        createdById: receptionist.id,
      },
    });
  }

  // --- Appointments & visits (Stage 3) --------------------------------------
  async function findOrCreateAppointment(opts: {
    entityId: string;
    patientId: string;
    doctorId: string;
    resourceId?: string;
    startAt: Date;
    endAt: Date;
    type: "CONSULTATION" | "TREATMENT" | "FOLLOW_UP" | "EMERGENCY";
    status?: "BOOKED" | "CONFIRMED";
    procedureHint?: string;
  }) {
    const existing = await prisma.appointment.findFirst({
      where: { entityId: opts.entityId, patientId: opts.patientId, startAt: opts.startAt },
    });
    if (existing) return existing;
    return prisma.appointment.create({
      data: {
        entityId: opts.entityId,
        patientId: opts.patientId,
        doctorId: opts.doctorId,
        resourceId: opts.resourceId,
        startAt: opts.startAt,
        endAt: opts.endAt,
        type: opts.type,
        status: opts.status ?? "BOOKED",
        procedureHint: opts.procedureHint,
        createdById: receptionist.id,
      },
    });
  }

  const clinicChair3 = await prisma.clinicResource.findFirstOrThrow({
    where: { entityId: entities.CLINIC.id, type: "CHAIR", number: 3 },
  });
  const clinicOt1 = await prisma.clinicResource.findFirstOrThrow({ where: { entityId: entities.CLINIC.id, type: "OT", number: 1 } });
  const trustChair1 = await prisma.clinicResource.findFirstOrThrow({ where: { entityId: entities.TRUST.id, type: "CHAIR", number: 1 } });

  await findOrCreateAppointment({
    entityId: entities.CLINIC.id,
    patientId: priya1.id,
    doctorId: doctor.id,
    resourceId: clinicChair3.id,
    startAt: new Date("2026-12-10T03:30:00.000Z"), // 09:00 IST
    endAt: new Date("2026-12-10T03:45:00.000Z"),
    type: "CONSULTATION",
    procedureHint: "Routine checkup",
  });

  await findOrCreateAppointment({
    entityId: entities.CLINIC.id,
    patientId: arun.id,
    doctorId: doctor.id,
    resourceId: clinicOt1.id,
    startAt: new Date("2026-12-10T05:30:00.000Z"), // 11:00 IST
    endAt: new Date("2026-12-10T07:30:00.000Z"),
    type: "TREATMENT",
    procedureHint: "Surgical extraction",
  });

  await findOrCreateAppointment({
    entityId: entities.TRUST.id,
    patientId: ravi.id,
    doctorId: doctor.id,
    resourceId: trustChair1.id,
    startAt: new Date("2026-12-11T04:00:00.000Z"), // 09:30 IST
    endAt: new Date("2026-12-11T04:15:00.000Z"),
    type: "CONSULTATION",
    status: "CONFIRMED",
  });

  // A visit already in progress, so the Waiting List screen shows something
  // the moment you log in without needing to check anyone in by hand.
  const existingWaitingVisit = await prisma.visit.findFirst({
    where: { entityId: entities.CLINIC.id, patientId: priya2.id, status: "WAITING" },
  });
  if (!existingWaitingVisit) {
    const visitNumber = await nextVisitNumber(prisma, entities.CLINIC.id);
    await prisma.visit.create({
      data: {
        visitNumber,
        entityId: entities.CLINIC.id,
        patientId: priya2.id,
        doctorId: doctor.id,
        resourceId: clinicChair3.id,
        chiefComplaint: "Walk-in — sensitivity in upper molar",
        status: "WAITING",
      },
    });
  }

  console.log("Seeded synthetic appointments (Clinic chair + OT, Trust chair) and one in-progress visit.");

  // --- Clinical module (Stage 4) --------------------------------------------
  const TREATMENT_CATALOG: Array<{ code: string; name: string; category: string; durationMinutes: number; price: number }> = [
    { code: "CONS-GEN", name: "General Consultation", category: "Consultation", durationMinutes: 15, price: 300 },
    { code: "SCALE-POL", name: "Scaling & Polishing", category: "Preventive", durationMinutes: 30, price: 1200 },
    { code: "FILL-COMP", name: "Composite Filling", category: "Restorative", durationMinutes: 30, price: 1800 },
    { code: "RCT-SINGLE", name: "Root Canal Treatment (single canal)", category: "Endodontics", durationMinutes: 60, price: 5000 },
    { code: "RCT-MULTI", name: "Root Canal Treatment (multi canal)", category: "Endodontics", durationMinutes: 90, price: 8000 },
    { code: "CROWN-PFM", name: "Crown (PFM)", category: "Prosthodontics", durationMinutes: 45, price: 6000 },
    { code: "EXTRACTION", name: "Simple Extraction", category: "Oral Surgery", durationMinutes: 30, price: 1500 },
    { code: "EXTRACT-SURG", name: "Surgical Extraction", category: "Oral Surgery", durationMinutes: 60, price: 4000 },
    { code: "IMPLANT", name: "Dental Implant", category: "Implantology", durationMinutes: 90, price: 35000 },
    { code: "ORTHO-CONSULT", name: "Orthodontic Consultation", category: "Orthodontics", durationMinutes: 30, price: 500 },
    { code: "WHITENING", name: "Teeth Whitening", category: "Cosmetic", durationMinutes: 45, price: 4500 },
    { code: "XRAY-IOPA", name: "Intraoral X-Ray (IOPA)", category: "Diagnostic", durationMinutes: 10, price: 250 },
  ];
  const catalogByCode: Record<string, Awaited<ReturnType<typeof prisma.treatmentCatalog.upsert>>> = {};
  for (const t of TREATMENT_CATALOG) {
    catalogByCode[t.code] = await prisma.treatmentCatalog.upsert({
      where: { code: t.code },
      update: { name: t.name, category: t.category, defaultDurationMinutes: t.durationMinutes, defaultPrice: t.price },
      create: {
        code: t.code,
        name: t.name,
        category: t.category,
        defaultDurationMinutes: t.durationMinutes,
        defaultPrice: t.price,
      },
    });
  }

  // A completed encounter for Ravi to hang clinical history off of.
  let raviVisit = await prisma.visit.findFirst({
    where: { entityId: entities.CLINIC.id, patientId: ravi.id, status: "COMPLETED" },
  });
  if (!raviVisit) {
    const visitNumber = await nextVisitNumber(prisma, entities.CLINIC.id);
    raviVisit = await prisma.visit.create({
      data: {
        visitNumber,
        entityId: entities.CLINIC.id,
        patientId: ravi.id,
        doctorId: doctor.id,
        resourceId: clinicChair3.id,
        chiefComplaint: "Tooth pain, lower right molar",
        status: "COMPLETED",
        clinicalFindings: "Deep caries on tooth 46, mild tenderness on percussion.",
        diagnosisSummary: "Irreversible pulpitis, tooth 46.",
        treatmentAdvice: "Root canal treatment recommended, followed by crown.",
        checkedOutAt: new Date(),
      },
    });
  }

  const existingChartEntry = await prisma.dentalChartEntry.findFirst({ where: { patientId: ravi.id, toothNumber: 46, condition: "Caries" } });
  if (!existingChartEntry) {
    await prisma.dentalChartEntry.create({
      data: { patientId: ravi.id, toothNumber: 46, condition: "Caries", status: "active", recordedById: doctorUser.id, visitId: raviVisit.id },
    });
  }

  const existingDiagnosis = await prisma.diagnosis.findFirst({ where: { visitId: raviVisit.id, toothNumber: 46 } });
  if (!existingDiagnosis) {
    await prisma.diagnosis.create({
      data: {
        visitId: raviVisit.id,
        patientId: ravi.id,
        toothNumber: 46,
        diagnosisCode: "K04.0",
        description: "Irreversible pulpitis",
        diagnosedById: doctor.id,
      },
    });
  }

  let ravisPlan = await prisma.treatmentPlan.findFirst({ where: { patientId: ravi.id, entityId: entities.CLINIC.id } });
  if (!ravisPlan) {
    ravisPlan = await prisma.treatmentPlan.create({
      data: {
        patientId: ravi.id,
        entityId: entities.CLINIC.id,
        visitId: raviVisit.id,
        status: "ACTIVE",
        createdById: doctorUser.id,
        items: {
          create: [
            {
              toothNumber: 46,
              treatmentCatalogId: catalogByCode["RCT-SINGLE"].id,
              plannedDoctorId: doctor.id,
              estimatedCost: 5000,
              status: "IN_PROGRESS",
              sortOrder: 1,
            },
            {
              toothNumber: 46,
              treatmentCatalogId: catalogByCode["CROWN-PFM"].id,
              plannedDoctorId: doctor.id,
              estimatedCost: 6000,
              status: "PLANNED",
              sortOrder: 2,
            },
          ],
        },
      },
      include: { items: true },
    });

    const rctItem = ravisPlan.items.find((i) => i.treatmentCatalogId === catalogByCode["RCT-SINGLE"].id)!;
    await prisma.treatmentSession.create({
      data: {
        treatmentPlanItemId: rctItem.id,
        visitId: raviVisit.id,
        entityId: entities.CLINIC.id,
        toothNumber: 46,
        procedureCode: "RCT-SINGLE",
        plannedByDoctorId: doctor.id,
        assignedDoctorId: doctor.id,
        performedByDoctorId: doctor.id,
        plannedDate: new Date("2026-01-01"),
        actualDate: new Date("2026-01-01"),
        status: "COMPLETED",
        estimatedCost: 5000,
        actualBilledAmount: 5000,
        clinicalRemarks: "Access opening done, canal cleaned and shaped, obturated in single sitting.",
      },
    });
  }

  const existingNote = await prisma.clinicalNote.findFirst({ where: { visitId: raviVisit.id, isAddendum: false } });
  let ravisNote = existingNote;
  if (!ravisNote) {
    ravisNote = await prisma.clinicalNote.create({
      data: {
        visitId: raviVisit.id,
        patientId: ravi.id,
        authoredById: doctorUser.id,
        noteType: "progress",
        body: "Patient presented with spontaneous pain, lower right molar. RCT initiated under local anesthesia.",
      },
    });
    await prisma.clinicalNote.create({
      data: {
        visitId: raviVisit.id,
        patientId: ravi.id,
        authoredById: doctorUser.id,
        noteType: "progress",
        body: "Addendum: patient tolerated procedure well, no immediate complications. Review in 1 week.",
        isAddendum: true,
        supersedesNoteId: ravisNote.id,
      },
    });
  }

  const existingRx = await prisma.prescription.findFirst({ where: { visitId: raviVisit.id } });
  if (!existingRx) {
    await prisma.prescription.create({
      data: {
        visitId: raviVisit.id,
        patientId: ravi.id,
        entityId: entities.CLINIC.id,
        prescribedById: doctor.id,
        itemsJson: [
          { drugName: "Amoxicillin 500mg", dosage: "1 capsule", frequency: "3 times/day", durationDays: 5, instructions: "After food" },
          { drugName: "Ibuprofen 400mg", dosage: "1 tablet", frequency: "As needed for pain", durationDays: 3, instructions: "Max 3/day" },
        ],
        notes: "Review after 1 week for obturation follow-up.",
      },
    });
  }

  // --- Billing (Stage 5): tax profile, an estimate awaiting conversion, a
  // fully-paid invoice with a credit note and a completed refund, and a
  // second, partially-paid invoice for a different patient. ---------------

  const gst18 = await prisma.taxProfile.upsert({
    where: { entityId_name: { entityId: entities.CLINIC.id, name: "GST 18%" } },
    update: {},
    create: { entityId: entities.CLINIC.id, name: "GST 18%", rate: 18, componentsJson: { CGST: 9, SGST: 9 } },
  });

  const rctSession = await prisma.treatmentSession.findFirst({ where: { visitId: raviVisit.id, procedureCode: "RCT-SINGLE" } });
  const crownPlanItem = await prisma.treatmentPlanItem.findFirst({
    where: { treatmentPlan: { patientId: ravi.id, entityId: entities.CLINIC.id }, treatmentCatalogId: catalogByCode["CROWN-PFM"].id },
  });

  // An ACCEPTED estimate for the crown, left un-invoiced so the seeded demo
  // has something to walk through "Convert to invoice" with.
  let crownEstimate = await prisma.estimate.findFirst({ where: { entityId: entities.CLINIC.id, patientId: ravi.id, status: "ACCEPTED" } });
  if (!crownEstimate) {
    const estimateNumber = await nextEstimateNumber(prisma, entities.CLINIC.id);
    crownEstimate = await prisma.estimate.create({
      data: {
        estimateNumber,
        entityId: entities.CLINIC.id,
        patientId: ravi.id,
        visitId: raviVisit.id,
        status: "ACCEPTED",
        createdById: billingExec.id,
        grossTotal: 6000,
        discountTotal: 0,
        taxTotal: 1080,
        netTotal: 7080,
        items: {
          create: [
            {
              treatmentPlanItemId: crownPlanItem?.id,
              toothNumber: 46,
              plannedDoctorId: doctor.id,
              treatmentCatalogId: catalogByCode["CROWN-PFM"].id,
              quantity: 1,
              unitPrice: 6000,
              discountAmount: 0,
              taxProfileId: gst18.id,
              lineTotal: 6000,
            },
          ],
        },
      },
    });
  }

  // An already-issued, already-paid invoice for the completed RCT, with a
  // goodwill credit note and a small completed refund — exercises the full
  // estimate-free "direct invoice" path plus every money-movement screen.
  let rctInvoice = await prisma.invoice.findFirst({ where: { entityId: entities.CLINIC.id, patientId: ravi.id, status: "PAID" } });
  if (!rctInvoice) {
    const invoiceNumber = await nextInvoiceNumber(prisma, entities.CLINIC.id);
    rctInvoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        entityId: entities.CLINIC.id,
        patientId: ravi.id,
        visitId: raviVisit.id,
        status: "ISSUED",
        createdById: billingExec.id,
        grossTotal: 5000,
        discountTotal: 0,
        taxTotal: 900,
        netTotal: 5900,
        items: {
          create: [
            {
              treatmentSessionId: rctSession?.id,
              toothNumber: 46,
              performedByDoctorId: doctor.id,
              description: "Root Canal Treatment (Single Sitting)",
              quantity: 1,
              unitPrice: 5000,
              discountAmount: 0,
              taxProfileId: gst18.id,
              lineTotal: 5000,
            },
          ],
        },
      },
    });

    const paymentNumber = `SEED-${rctInvoice.id.slice(-8)}`;
    const rctPayment = await prisma.payment.create({
      data: {
        entityId: entities.CLINIC.id,
        patientId: ravi.id,
        amount: 5900,
        mode: "CASH",
        receivedById: accountant.id,
        idempotencyKey: paymentNumber,
      },
    });
    const receiptNumber = await nextReceiptNumber(prisma, entities.CLINIC.id);
    await prisma.receipt.create({
      data: { receiptNumber, paymentId: rctPayment.id, entityId: entities.CLINIC.id, cashierId: accountant.id },
    });
    await prisma.paymentAllocation.create({
      data: { paymentId: rctPayment.id, invoiceId: rctInvoice.id, amount: 5900, allocatedById: accountant.id },
    });
    // Trigger-maintained (trg_payment_allocation_insupd) — reload to pick up paidAmount/status.
    rctInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: rctInvoice.id } });

    await prisma.creditNote.create({
      data: {
        entityId: entities.CLINIC.id,
        patientId: ravi.id,
        invoiceId: rctInvoice.id,
        amount: 100,
        reason: "Loyalty goodwill discount",
        issuedById: accountant.id,
      },
    });

    await prisma.refund.create({
      data: {
        entityId: entities.CLINIC.id,
        patientId: ravi.id,
        paymentId: rctPayment.id,
        amount: 100,
        reason: "Refunded the goodwill credit note amount in cash",
        mode: "CASH",
        status: "COMPLETED",
        requestedById: billingExec.id,
        approvedById: accountant.id,
        refundedAt: new Date(),
      },
    });
  }

  // A second, PARTIALLY_PAID invoice for a different patient — the
  // 50%-paid state is otherwise easy to forget to demo.
  let priyaInvoice = await prisma.invoice.findFirst({ where: { entityId: entities.CLINIC.id, patientId: priya2.id } });
  if (!priyaInvoice) {
    const invoiceNumber = await nextInvoiceNumber(prisma, entities.CLINIC.id);
    priyaInvoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        entityId: entities.CLINIC.id,
        patientId: priya2.id,
        status: "ISSUED",
        createdById: billingExec.id,
        grossTotal: 800,
        discountTotal: 0,
        taxTotal: 0,
        netTotal: 800,
        items: {
          create: [
            {
              description: "Consultation + Scaling & Polishing",
              quantity: 1,
              unitPrice: 800,
              discountAmount: 0,
              lineTotal: 800,
            },
          ],
        },
      },
    });

    const priyaPayment = await prisma.payment.create({
      data: {
        entityId: entities.CLINIC.id,
        patientId: priya2.id,
        amount: 400,
        mode: "UPI",
        transactionReference: "UPI-SEED-0001",
        receivedById: accountant.id,
        idempotencyKey: `SEED-${priyaInvoice.id.slice(-8)}`,
      },
    });
    const priyaReceiptNumber = await nextReceiptNumber(prisma, entities.CLINIC.id);
    await prisma.receipt.create({
      data: { receiptNumber: priyaReceiptNumber, paymentId: priyaPayment.id, entityId: entities.CLINIC.id, cashierId: accountant.id },
    });
    await prisma.paymentAllocation.create({
      data: { paymentId: priyaPayment.id, invoiceId: priyaInvoice.id, amount: 400, allocatedById: accountant.id },
    });
  }

  console.log(`Seeded billing: 1 tax profile, 1 ACCEPTED estimate awaiting conversion, 1 fully-paid invoice (+credit note +refund), 1 partially-paid invoice.`);

  // --- Documents & consent (Stage 6) ---------------------------------------

  const existingDoc = await prisma.patientDocument.findFirst({ where: { patientId: ravi.id, category: "xray" } });
  if (!existingDoc) {
    await prisma.patientDocument.create({
      data: {
        patientId: ravi.id,
        entityId: entities.CLINIC.id,
        visitId: raviVisit.id,
        category: "xray",
        // Seed data only — no real bytes sit behind this key, so its
        // download link in the UI won't actually resolve to a file; it
        // exists to demonstrate the Documents tab's listing/metadata.
        storageKey: `patients/${ravi.id}/seed-tooth46-iopa.png`,
        originalFilename: "tooth46-iopa.png",
        mimeType: "image/png",
        sizeBytes: 182_340,
        uploadedById: doctorUser.id,
        scanStatus: "CLEAN",
      },
    });
  }

  const existingTreatmentConsent = await prisma.consentRecord.findFirst({ where: { patientId: ravi.id, consentType: "TREATMENT" } });
  if (!existingTreatmentConsent) {
    await prisma.consentRecord.create({
      data: {
        patientId: ravi.id,
        entityId: entities.CLINIC.id,
        consentType: "TREATMENT",
        granted: true,
        capturedById: doctorUser.id,
        version: 1,
      },
    });
  }

  console.log("Seeded 1 sample patient document (X-ray) and 1 treatment consent record for Ravi Kumar.");

  console.log(`Seeded treatment catalog (${TREATMENT_CATALOG.length} procedures) and clinical history for ${ravi.fullName}.`);

  console.log(`Seeded synthetic patients (UHIDs: ${ravi.uhid}, ${priya1.uhid}, ${priya2.uhid}, ${arun.uhid}) and temp registrations (${checkedInReg.tempId} checked in, ${openReg.tempId} open).`);

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
