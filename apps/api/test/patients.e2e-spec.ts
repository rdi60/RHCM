import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@rhcm/database";
import { createTestApp, extractCookie, loginWithMfa } from "./test-app";

const DEV_PASSWORD = "DevPass!2026";

describe("Patients (Stage 2)", () => {
  let app: INestApplication;
  let server: any;
  let clinicId: string;
  let trustId: string;
  let receptionistCookie: string;
  let superAdminCookie: string;

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();

    const clinic = await prisma.entity.findUniqueOrThrow({ where: { code: "CLINIC" } });
    const trust = await prisma.entity.findUniqueOrThrow({ where: { code: "TRUST" } });
    clinicId = clinic.id;
    trustId = trust.id;

    const recRes = await request(server)
      .post("/auth/login")
      .send({ email: "receptionist@rhcm.test", password: DEV_PASSWORD })
      .expect(200);
    receptionistCookie = extractCookie(recRes);

    superAdminCookie = await loginWithMfa(server, "superadmin@rhcm.test", DEV_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe("temporary registration", () => {
    it("allows an incomplete registration with only a name", async () => {
      const res = await request(server)
        .post("/temp-registrations")
        .set("Cookie", receptionistCookie)
        .send({ entityId: clinicId, fullName: "Incomplete Entry" })
        .expect(201);
      expect(res.body.tempId).toMatch(/^TMP-\d{6}$/);
      expect(res.body.status).toBe("OPEN");
      expect(res.body.phone).toBeNull();
    });

    it("generates per-entity temp IDs that can repeat in format across entities without colliding", async () => {
      const clinicReg = await request(server)
        .post("/temp-registrations")
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, fullName: "Clinic Side" })
        .expect(201);
      const trustReg = await request(server)
        .post("/temp-registrations")
        .set("Cookie", superAdminCookie)
        .send({ entityId: trustId, fullName: "Trust Side" })
        .expect(201);
      // Both are valid, independently-sequenced per-entity ids; the point is
      // creating one at each entity never collides even if the numbers match.
      expect(clinicReg.body.tempId).toMatch(/^TMP-\d{6}$/);
      expect(trustReg.body.tempId).toMatch(/^TMP-\d{6}$/);
    });
  });

  describe("UHID generation", () => {
    it("never assigns the same UHID twice, even under concurrent check-ins", async () => {
      const regs = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          request(server)
            .post("/temp-registrations")
            .set("Cookie", superAdminCookie)
            .send({ entityId: clinicId, fullName: `Concurrent Patient ${i}` })
            .expect(201),
        ),
      );

      const checkIns = await Promise.all(
        regs.map((r) =>
          request(server)
            .post(`/temp-registrations/${r.body.id}/check-in`)
            .set("Cookie", superAdminCookie)
            .send({ entityId: clinicId })
            .expect(201),
        ),
      );

      const uhids = checkIns.map((c) => c.body.patient.uhid);
      expect(new Set(uhids).size).toBe(uhids.length);
    });
  });

  describe("search and duplicate detection", () => {
    it("surfaces both patients of a deliberate same-name pair", async () => {
      const res = await request(server)
        .get(`/patients/search?entityId=${clinicId}&q=Priya`)
        .set("Cookie", superAdminCookie)
        .expect(200);
      const names = res.body.patients.map((p: any) => `${p.fullName} ${p.phone}`);
      expect(res.body.patients.length).toBeGreaterThanOrEqual(2);
      expect(names).toEqual(expect.arrayContaining([expect.stringContaining("+91-9000000002"), expect.stringContaining("+91-9000000003")]));
    });

    it("never returns another entity's patients from the default search", async () => {
      // Ravi Kumar is seeded as CLINIC-only; searching at TRUST must not find him.
      const res = await request(server)
        .get(`/patients/search?entityId=${trustId}&q=Ravi`)
        .set("Cookie", superAdminCookie)
        .expect(200);
      expect(res.body.patients).toHaveLength(0);
    });
  });

  describe("cross-entity linking", () => {
    it("denies a receptionist (no PATIENT_CROSS_ENTITY_LINK) from the cross-entity search", async () => {
      await request(server)
        .get(`/patients/cross-entity-search?entityId=${trustId}&q=Ravi`)
        .set("Cookie", receptionistCookie)
        .expect(403);
    });

    it("lets a super administrator find a Clinic-only patient from the Trust side", async () => {
      const res = await request(server)
        .get(`/patients/cross-entity-search?entityId=${trustId}&q=Ravi`)
        .set("Cookie", superAdminCookie)
        .expect(200);
      expect(res.body.some((p: any) => p.fullName === "Ravi Kumar" && p.linkedEntities.includes("CLINIC"))).toBe(true);
    });

    it("refuses to check in a cross-entity match without recorded consent", async () => {
      const reg = await request(server)
        .post("/temp-registrations")
        .set("Cookie", superAdminCookie)
        .send({ entityId: trustId, fullName: "Ravi Kumar", phone: "+91-9000000001" })
        .expect(201);
      const ravi = await prisma.patient.findFirstOrThrow({ where: { phone: "+91-9000000001" } });

      const res = await request(server)
        .post(`/temp-registrations/${reg.body.id}/check-in`)
        .set("Cookie", superAdminCookie)
        .send({ entityId: trustId, matchedPatientId: ravi.id })
        .expect(400);
      expect(res.body.message).toMatch(/consent/i);
    });

    it("completes the cross-entity check-in once consent is recorded, keeping the same UHID", async () => {
      const reg = await request(server)
        .post("/temp-registrations")
        .set("Cookie", superAdminCookie)
        .send({ entityId: trustId, fullName: "Ravi Kumar", phone: "+91-9000000001" })
        .expect(201);
      const ravi = await prisma.patient.findFirstOrThrow({ where: { phone: "+91-9000000001" } });

      const res = await request(server)
        .post(`/temp-registrations/${reg.body.id}/check-in`)
        .set("Cookie", superAdminCookie)
        .send({ entityId: trustId, matchedPatientId: ravi.id, crossEntityConsentGranted: true })
        .expect(201);

      expect(res.body.patient.uhid).toBe(ravi.uhid);

      const consent = await prisma.consentRecord.findFirst({
        where: { patientId: ravi.id, entityId: trustId, consentType: "CROSS_ENTITY_IDENTITY_LINKING" },
      });
      expect(consent?.granted).toBe(true);
    });
  });

  describe("entity isolation", () => {
    it("rejects checking in a temp registration against the wrong entity", async () => {
      const reg = await request(server)
        .post("/temp-registrations")
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, fullName: "Entity Scoped Patient" })
        .expect(201);

      await request(server)
        .post(`/temp-registrations/${reg.body.id}/check-in`)
        .set("Cookie", superAdminCookie)
        .send({ entityId: trustId })
        .expect(404);
    });
  });

  describe("patient detail", () => {
    it("404s when the patient has no link to the requested entity", async () => {
      const clinicOnly = await prisma.patient.findFirstOrThrow({ where: { phone: "+91-9000000002" } }); // Priya Sharma #1, Clinic-only
      await request(server).get(`/patients/${clinicOnly.id}?entityId=${trustId}`).set("Cookie", superAdminCookie).expect(404);
      await request(server).get(`/patients/${clinicOnly.id}?entityId=${clinicId}`).set("Cookie", superAdminCookie).expect(200);
    });

    it("lets an authorized user update a patient's allergies and alerts", async () => {
      const patient = await prisma.patient.findFirstOrThrow({ where: { phone: "+91-9000000002" } });
      const res = await request(server)
        .patch(`/patients/${patient.id}`)
        .set("Cookie", superAdminCookie)
        .send({ entityId: clinicId, allergiesJson: ["Latex"], medicalAlertsJson: ["Diabetic"] })
        .expect(200);
      expect(res.body.allergiesJson).toEqual(["Latex"]);
    });
  });
});
