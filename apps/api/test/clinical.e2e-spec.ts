import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@rhcm/database";
import { createTestApp, extractCookie, loginWithMfa } from "./test-app";

const DEV_PASSWORD = "DevPass!2026";

describe("Clinical module (Stage 4)", () => {
  let app: INestApplication;
  let server: any;
  let clinicId: string;
  let trustId: string;
  let doctorId: string;
  let patientId: string;
  let catalogItemId: string;
  let superAdminCookie: string;
  let doctorCookie: string;
  let nurseCookie: string;
  let receptionistCookie: string;

  async function loginSimple(email: string): Promise<string> {
    const res = await request(server).post("/auth/login").send({ email, password: DEV_PASSWORD }).expect(200);
    return extractCookie(res);
  }

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();

    const clinic = await prisma.entity.findUniqueOrThrow({ where: { code: "CLINIC" } });
    const trust = await prisma.entity.findUniqueOrThrow({ where: { code: "TRUST" } });
    clinicId = clinic.id;
    trustId = trust.id;

    const doctor = await prisma.doctor.findFirstOrThrow({ where: { registrationNumber: "DCI-10001" } });
    doctorId = doctor.id;

    const patient = await prisma.patient.findFirstOrThrow({ where: { phone: "+91-9000000001" } });
    patientId = patient.id;

    const catalogItem = await prisma.treatmentCatalog.findFirstOrThrow({ where: { code: "SCALE-POL" } });
    catalogItemId = catalogItem.id;

    receptionistCookie = await loginSimple("receptionist@rhcm.test");
    doctorCookie = await loginSimple("doctor@rhcm.test");
    nurseCookie = await loginSimple("nurse@rhcm.test");

    superAdminCookie = await loginWithMfa(server, "superadmin@rhcm.test", DEV_PASSWORD);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function createVisitFor(patient: string, entityId: string) {
    return prisma.visit.create({
      data: {
        visitNumber: `VS-TEST-${Math.random().toString(36).slice(2, 8)}`,
        entityId,
        patientId: patient,
        doctorId,
        status: "WAITING",
      },
    });
  }

  describe("treatment catalog", () => {
    it("is readable globally, not entity-scoped", async () => {
      const res = await request(server).get("/treatment-catalog").set("Cookie", doctorCookie).expect(200);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe("dental chart (odontogram)", () => {
    it("keeps full history rather than overwriting — append-only", async () => {
      await request(server)
        .post(`/patients/${patientId}/dental-chart`)
        .set("Cookie", doctorCookie)
        .send({ entityId: clinicId, toothNumber: 17, condition: "Caries" })
        .expect(201);
      await request(server)
        .post(`/patients/${patientId}/dental-chart`)
        .set("Cookie", doctorCookie)
        .send({ entityId: clinicId, toothNumber: 17, condition: "Filled" })
        .expect(201);

      const res = await request(server).get(`/patients/${patientId}/dental-chart?entityId=${clinicId}`).set("Cookie", doctorCookie).expect(200);
      const tooth17Entries = res.body.filter((e: any) => e.toothNumber === 17);
      expect(tooth17Entries.length).toBeGreaterThanOrEqual(2);
      // Most recent first.
      expect(tooth17Entries[0].condition).toBe("Filled");
    });

    it("denies recording a chart entry without clinical.diagnose", async () => {
      await request(server)
        .post(`/patients/${patientId}/dental-chart`)
        .set("Cookie", receptionistCookie)
        .send({ entityId: clinicId, toothNumber: 18, condition: "Healthy" })
        .expect(403);
    });
  });

  describe("treatment plan -> item -> session lifecycle", () => {
    it("auto-advances item and plan status as sessions complete", async () => {
      const visit = await createVisitFor(patientId, clinicId);

      const plan = await request(server)
        .post(`/patients/${patientId}/treatment-plans`)
        .set("Cookie", doctorCookie)
        .send({ entityId: clinicId, visitId: visit.id, items: [] })
        .expect(201);
      expect(plan.body.status).toBe("ACTIVE");

      const item = await request(server)
        .post(`/treatment-plans/${plan.body.id}/items`)
        .set("Cookie", doctorCookie)
        .send({ entityId: clinicId, treatmentCatalogId: catalogItemId })
        .expect(201);
      expect(item.body.status).toBe("PLANNED");
      expect(Number(item.body.estimatedCost)).toBeGreaterThan(0); // defaulted from catalog price

      const session = await request(server)
        .post(`/treatment-plan-items/${item.body.id}/sessions`)
        .set("Cookie", doctorCookie)
        .send({ entityId: clinicId })
        .expect(201);

      // Creating a session moves the item from PLANNED to IN_PROGRESS.
      const afterSessionCreate = await request(server)
        .get(`/patients/${patientId}/treatment-plans?entityId=${clinicId}`)
        .set("Cookie", doctorCookie)
        .expect(200);
      const thisPlan = afterSessionCreate.body.find((p: any) => p.id === plan.body.id);
      expect(thisPlan.items.find((i: any) => i.id === item.body.id).status).toBe("IN_PROGRESS");

      await request(server)
        .patch(`/treatment-sessions/${session.body.id}`)
        .set("Cookie", doctorCookie)
        .send({ entityId: clinicId, status: "COMPLETED", actualBilledAmount: 1200 })
        .expect(200)
        .then((res) => {
          expect(res.body.performedByDoctorId).toBe(doctorId); // auto-resolved from the acting doctor account
        });

      const afterComplete = await request(server)
        .get(`/patients/${patientId}/treatment-plans?entityId=${clinicId}`)
        .set("Cookie", doctorCookie)
        .expect(200);
      const completedPlan = afterComplete.body.find((p: any) => p.id === plan.body.id);
      expect(completedPlan.items.find((i: any) => i.id === item.body.id).status).toBe("COMPLETED");
    });

    it("denies planning treatment to a nurse (no clinical.plan_treatment)", async () => {
      await request(server)
        .post(`/patients/${patientId}/treatment-plans`)
        .set("Cookie", nurseCookie)
        .send({ entityId: clinicId, items: [] })
        .expect(403);
    });

    it("denies performing a session to a receptionist (no clinical.perform_treatment)", async () => {
      const visit = await createVisitFor(patientId, clinicId);
      const plan = await request(server)
        .post(`/patients/${patientId}/treatment-plans`)
        .set("Cookie", doctorCookie)
        .send({ entityId: clinicId, visitId: visit.id, items: [] })
        .expect(201);
      const item = await request(server)
        .post(`/treatment-plans/${plan.body.id}/items`)
        .set("Cookie", doctorCookie)
        .send({ entityId: clinicId, treatmentCatalogId: catalogItemId })
        .expect(201);
      const session = await request(server)
        .post(`/treatment-plan-items/${item.body.id}/sessions`)
        .set("Cookie", doctorCookie)
        .send({ entityId: clinicId })
        .expect(201);

      await request(server)
        .patch(`/treatment-sessions/${session.body.id}`)
        .set("Cookie", receptionistCookie)
        .send({ entityId: clinicId, status: "COMPLETED" })
        .expect(403);
    });
  });

  describe("clinical notes (append-only addenda)", () => {
    it("chains an addendum to its original note without altering it", async () => {
      const visit = await createVisitFor(patientId, clinicId);
      const note = await request(server)
        .post(`/visits/${visit.id}/notes`)
        .set("Cookie", doctorCookie)
        .send({ entityId: clinicId, body: "Initial finding." })
        .expect(201);

      await request(server)
        .post(`/clinical-notes/${note.body.id}/addendum`)
        .set("Cookie", doctorCookie)
        .send({ entityId: clinicId, body: "Correction: actually tooth 36, not 37." })
        .expect(201);

      const list = await request(server).get(`/visits/${visit.id}/notes?entityId=${clinicId}`).set("Cookie", doctorCookie).expect(200);
      expect(list.body).toHaveLength(2);
      const original = list.body.find((n: any) => n.id === note.body.id);
      expect(original.body).toBe("Initial finding."); // never mutated
      const addendum = list.body.find((n: any) => n.supersedesNoteId === note.body.id);
      expect(addendum.isAddendum).toBe(true);
    });
  });

  describe("prescriptions", () => {
    it("lets a doctor issue a prescription and denies a receptionist", async () => {
      const visit = await createVisitFor(patientId, clinicId);

      await request(server)
        .post(`/visits/${visit.id}/prescriptions`)
        .set("Cookie", receptionistCookie)
        .send({ entityId: clinicId, items: [{ drugName: "X", dosage: "1", frequency: "1/day", durationDays: 3 }] })
        .expect(403);

      const res = await request(server)
        .post(`/visits/${visit.id}/prescriptions`)
        .set("Cookie", doctorCookie)
        .send({ entityId: clinicId, items: [{ drugName: "Amoxicillin", dosage: "500mg", frequency: "2/day", durationDays: 5 }] })
        .expect(201);
      expect(res.body.itemsJson).toHaveLength(1);
    });
  });

  describe("entity isolation", () => {
    it("404s fetching another entity's visit diagnoses/notes/prescriptions", async () => {
      const visit = await createVisitFor(patientId, clinicId);
      await request(server).get(`/visits/${visit.id}/diagnoses?entityId=${trustId}`).set("Cookie", superAdminCookie).expect(404);
      await request(server).get(`/visits/${visit.id}/notes?entityId=${trustId}`).set("Cookie", superAdminCookie).expect(404);
      await request(server).get(`/visits/${visit.id}/prescriptions?entityId=${trustId}`).set("Cookie", superAdminCookie).expect(404);
    });
  });
});
