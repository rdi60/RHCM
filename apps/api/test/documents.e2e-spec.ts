import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { prisma } from "@rhcm/database";
import { createTestApp, extractCookie } from "./test-app";

const DEV_PASSWORD = "DevPass!2026";

describe("Documents & Consent (Stage 6)", () => {
  let app: INestApplication;
  let server: any;
  let clinicId: string;
  let trustId: string;
  let patientId: string;
  let superAdminCookie: string;
  let doctorCookie: string;
  let accountantCookie: string;
  let nurseCookie: string;

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

    doctorCookie = await loginSimple("doctor@rhcm.test");
    nurseCookie = await loginSimple("nurse@rhcm.test");
    accountantCookie = await loginMfa("accountant@rhcm.test");
    superAdminCookie = await loginMfa("superadmin@rhcm.test");
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  function requestUpload(cookie: string, overrides: Partial<Record<string, unknown>> = {}) {
    return request(server)
      .post(`/patients/${patientId}/documents/upload-url`)
      .set("Cookie", cookie)
      .send({
        entityId: clinicId,
        category: "xray",
        filename: "test-scan.png",
        mimeType: "image/png",
        sizeBytes: 2048,
        ...overrides,
      });
  }

  describe("upload / confirm / list / download / delete", () => {
    it("requests an upload URL (fake storage in tests), confirms it, lists it, and downloads only once CLEAN", async () => {
      const upload = await requestUpload(doctorCookie).expect(201);
      expect(upload.body.documentId).toBeTruthy();
      expect(typeof upload.body.uploadUrl).toBe("string");

      // Not downloadable until confirmed (still PENDING).
      await request(server)
        .get(`/documents/${upload.body.documentId}/download-url?entityId=${clinicId}`)
        .set("Cookie", doctorCookie)
        .expect(400);

      await request(server)
        .post(`/documents/${upload.body.documentId}/confirm`)
        .set("Cookie", doctorCookie)
        .send({ entityId: clinicId })
        .expect(201)
        .then((res) => expect(res.body.scanStatus).toBe("CLEAN"));

      const list = await request(server).get(`/patients/${patientId}/documents?entityId=${clinicId}`).set("Cookie", doctorCookie).expect(200);
      expect(list.body.some((d: any) => d.id === upload.body.documentId)).toBe(true);

      const download = await request(server)
        .get(`/documents/${upload.body.documentId}/download-url?entityId=${clinicId}`)
        .set("Cookie", doctorCookie)
        .expect(200);
      expect(typeof download.body.downloadUrl).toBe("string");
    });

    it("soft-deletes: removed from the list, but not reachable by a fresh request either", async () => {
      const upload = await requestUpload(doctorCookie).expect(201);
      await request(server).post(`/documents/${upload.body.documentId}/confirm`).set("Cookie", doctorCookie).send({ entityId: clinicId }).expect(201);

      await request(server).delete(`/documents/${upload.body.documentId}?entityId=${clinicId}`).set("Cookie", superAdminCookie).expect(200);

      const list = await request(server).get(`/patients/${patientId}/documents?entityId=${clinicId}`).set("Cookie", doctorCookie).expect(200);
      expect(list.body.some((d: any) => d.id === upload.body.documentId)).toBe(false);

      await request(server)
        .get(`/documents/${upload.body.documentId}/download-url?entityId=${clinicId}`)
        .set("Cookie", doctorCookie)
        .expect(404);
    });

    it("rejects a file over the upload size limit", async () => {
      await requestUpload(doctorCookie, { sizeBytes: 26 * 1024 * 1024 }).expect(400);
    });

    it("denies upload without document.upload, and denies delete without document.delete", async () => {
      await requestUpload(accountantCookie).expect(403);

      const upload = await requestUpload(doctorCookie).expect(201);
      await request(server)
        .delete(`/documents/${upload.body.documentId}?entityId=${clinicId}`)
        .set("Cookie", accountantCookie)
        .expect(403);
    });

    it("404s a document fetched from the wrong entity", async () => {
      const upload = await requestUpload(doctorCookie).expect(201);
      await request(server).get(`/documents/${upload.body.documentId}/download-url?entityId=${trustId}`).set("Cookie", superAdminCookie).expect(404);
    });
  });

  describe("consent records (append-only, versioned)", () => {
    it("versions a new consent capture of the same type rather than overwriting it", async () => {
      const first = await request(server)
        .post(`/patients/${patientId}/consents`)
        .set("Cookie", doctorCookie)
        .send({ entityId: clinicId, consentType: "MARKETING", granted: false })
        .expect(201);
      expect(first.body.version).toBe(1);

      const second = await request(server)
        .post(`/patients/${patientId}/consents`)
        .set("Cookie", doctorCookie)
        .send({ entityId: clinicId, consentType: "MARKETING", granted: true })
        .expect(201);
      expect(second.body.version).toBe(2);

      const list = await request(server).get(`/patients/${patientId}/consents?entityId=${clinicId}`).set("Cookie", doctorCookie).expect(200);
      const marketingRecords = list.body.filter((c: any) => c.consentType === "MARKETING");
      expect(marketingRecords).toHaveLength(2);
      expect(marketingRecords.find((c: any) => c.version === 1).granted).toBe(false);
      expect(marketingRecords.find((c: any) => c.version === 2).granted).toBe(true);
    });

    it("denies recording consent without patient.consent_manage", async () => {
      await request(server)
        .post(`/patients/${patientId}/consents`)
        .set("Cookie", nurseCookie)
        .send({ entityId: clinicId, consentType: "TREATMENT", granted: true })
        .expect(403);
    });
  });
});
