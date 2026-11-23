import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@rhcm/database";
import { createTestApp, extractCookie } from "./test-app";

const DEV_PASSWORD = "DevPass!2026";

describe("Reports & Audit Log (Stage 6)", () => {
  let app: INestApplication;
  let server: any;
  let clinicId: string;
  let trustId: string;
  let patientId: string;
  let catalogItemId: string;
  let superAdminCookie: string;
  let billingCookie: string;
  let accountantCookie: string;

  async function loginSimple(email: string): Promise<string> {
    const res = await request(server).post("/auth/login").send({ email, password: DEV_PASSWORD }).expect(200);
    return extractCookie(res);
  }

  async function loginMfa(email: string): Promise<string> {
    const { authenticator } = await import("otplib");
    const loginRes = await request(server).post("/auth/login").send({ email, password: DEV_PASSWORD }).expect(200);
    const pendingCookie = extractCookie(loginRes);
    const code = authenticator.generate("JBSWY3DPEHPK3PXP");
    const mfaRes = await request(server).post("/auth/mfa/verify").set("Cookie", pendingCookie).send({ code }).expect(200);
    return extractCookie(mfaRes);
  }

  beforeAll(async () => {
    app = await createTestApp();
    server = app.getHttpServer();

    const clinic = await prisma.entity.findUniqueOrThrow({ where: { code: "CLINIC" } });
    const trust = await prisma.entity.findUniqueOrThrow({ where: { code: "TRUST" } });
    clinicId = clinic.id;
    trustId = trust.id;

    const patient = await prisma.patient.findFirstOrThrow({ where: { phone: "+91-9000000001" } });
    patientId = patient.id;
    const catalogItem = await prisma.treatmentCatalog.findFirstOrThrow({ where: { code: "SCALE-POL" } });
    catalogItemId = catalogItem.id;

    billingCookie = await loginSimple("billing@rhcm.test");
    accountantCookie = await loginMfa("accountant@rhcm.test");
    superAdminCookie = await loginMfa("superadmin@rhcm.test");
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe("collections", () => {
    it("reflects a freshly recorded payment in today's by-day/by-mode breakdown", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const before = await request(server).get(`/reports/collections?entityId=${clinicId}&from=${today}&to=${today}`).set("Cookie", billingCookie).expect(200);
      const beforeTotal = Number(before.body.total);

      await request(server)
        .post(`/patients/${patientId}/payments`)
        .set("Cookie", accountantCookie)
        .send({ entityId: clinicId, amount: 1357, mode: "BANK_TRANSFER" })
        .expect(201);

      const after = await request(server).get(`/reports/collections?entityId=${clinicId}&from=${today}&to=${today}`).set("Cookie", billingCookie).expect(200);
      expect(Number(after.body.total)).toBeCloseTo(beforeTotal + 1357, 2);
      expect(after.body.byMode.find((m: any) => m.mode === "BANK_TRANSFER").amount).toBe("1357");
    });

    it("never leaks another entity's totals into this entity's report", async () => {
      // A distinctive amount/mode pair, recorded in Trust — other spec files
      // in this shared test DB may have their own Trust/Clinic payments, so
      // isolation is checked by this specific marker's presence/absence
      // rather than by assuming either entity starts at zero.
      const arun = await prisma.patient.findFirstOrThrow({ where: { fullName: "Arun Das" } });
      await request(server)
        .post(`/patients/${arun.id}/payments`)
        .set("Cookie", accountantCookie)
        .send({ entityId: trustId, amount: 24681, mode: "CARD" })
        .expect(201);

      const clinicReport = await request(server).get(`/reports/collections?entityId=${clinicId}`).set("Cookie", superAdminCookie).expect(200);
      expect(clinicReport.body.byMode.find((m: any) => m.mode === "CARD" && m.amount === "24681")).toBeUndefined();

      const trustReport = await request(server).get(`/reports/collections?entityId=${trustId}`).set("Cookie", superAdminCookie).expect(200);
      expect(trustReport.body.byMode.find((m: any) => m.mode === "CARD")?.amount).toBe("24681");
    });
  });

  describe("outstanding balances", () => {
    it("lists a freshly created unpaid invoice with its exact balance", async () => {
      const invoice = await request(server)
        .post(`/patients/${patientId}/invoices`)
        .set("Cookie", billingCookie)
        .send({ entityId: clinicId, items: [{ description: "Outstanding report test", quantity: 1, unitPrice: 999 }] })
        .expect(201);

      const report = await request(server).get(`/reports/outstanding-balances?entityId=${clinicId}`).set("Cookie", billingCookie).expect(200);
      const row = report.body.invoices.find((i: any) => i.invoiceId === invoice.body.id);
      expect(row).toBeTruthy();
      expect(row.balance).toBe("999");
      expect(row.status).toBe("ISSUED");
    });
  });

  describe("doctor production", () => {
    it("attributes invoiced lines to the performing doctor, isolated via a fresh doctor record", async () => {
      const freshDoctor = await prisma.doctor.create({
        data: { fullName: "Dr. Report Test", registrationNumber: `REPTEST-${Date.now()}`, defaultConsultationFee: 0 },
      });

      // Ad hoc invoices created through the public API don't accept an
      // explicit performedByDoctorId (that's populated from a treatment
      // session when invoicing clinical work), so we build this one
      // directly to isolate the aggregation logic from a brand-new doctor
      // with no other invoiced lines.
      const invoiceNumber = `REPTEST-${Date.now()}`;
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber,
          entityId: clinicId,
          patientId,
          status: "ISSUED",
          grossTotal: 321,
          netTotal: 321,
          items: {
            create: [{ description: "Fresh-doctor production test", quantity: 1, unitPrice: 321, lineTotal: 321, performedByDoctorId: freshDoctor.id }],
          },
        },
      });

      const report = await request(server).get(`/reports/doctor-production?entityId=${clinicId}`).set("Cookie", billingCookie).expect(200);
      const row = report.body.rows.find((r: any) => r.doctorId === freshDoctor.id);
      expect(row).toBeTruthy();
      expect(row.amount).toBe("321");
      expect(row.doctorName).toBe("Dr. Report Test");

      await prisma.invoice.delete({ where: { id: invoice.id } });
      await prisma.doctor.delete({ where: { id: freshDoctor.id } });
    });
  });

  describe("cross-entity", () => {
    it("denies the cross-entity variant without report.cross_entity, and unions per entity for a user who has it", async () => {
      await request(server).get("/reports/collections/cross-entity").set("Cookie", billingCookie).expect(403);

      const combined = await request(server).get("/reports/collections/cross-entity").set("Cookie", superAdminCookie).expect(200);
      const entityCodes = combined.body.map((r: any) => r.entityCode).sort();
      expect(entityCodes).toEqual(["CLINIC", "TRUST"]);
    });
  });

  describe("audit log filters", () => {
    it("narrows by action substring, resourceType, and date range", async () => {
      await request(server)
        .post(`/patients/${patientId}/invoices`)
        .set("Cookie", billingCookie)
        .send({ entityId: clinicId, items: [{ description: "Audit filter test", quantity: 1, unitPrice: 50 }] })
        .expect(201);

      const byAction = await request(server)
        .get(`/audit-logs?entityId=${clinicId}&action=invoice_created`)
        .set("Cookie", superAdminCookie)
        .expect(200);
      expect(byAction.body.length).toBeGreaterThan(0);
      expect(byAction.body.every((r: any) => r.action.includes("invoice_created"))).toBe(true);
      expect(byAction.body[0].actor?.email).toBeTruthy();

      const byResourceType = await request(server)
        .get(`/audit-logs?entityId=${clinicId}&resourceType=refund`)
        .set("Cookie", superAdminCookie)
        .expect(200);
      expect(byResourceType.body.every((r: any) => r.resourceType === "refund")).toBe(true);

      const farFuture = "2099-01-01";
      const byDate = await request(server)
        .get(`/audit-logs?entityId=${clinicId}&from=${farFuture}&to=${farFuture}`)
        .set("Cookie", superAdminCookie)
        .expect(200);
      expect(byDate.body).toHaveLength(0);
    });

    it("denies reading the audit log without audit_log.read", async () => {
      await request(server).get(`/audit-logs?entityId=${clinicId}`).set("Cookie", billingCookie).expect(403);
    });
  });
});
